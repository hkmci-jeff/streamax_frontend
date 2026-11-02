// Browser -> Cloud Storage uploads, in pieces ("resumable upload").
//
// The portal's server only authorises the upload and opens a session; the bytes go straight
// from this browser to Cloud Storage, so a 2 GB file never passes through the server and an
// interrupted upload can carry on from where it stopped.
import { api, ApiError } from "./api.js";

const MAX_TRIES = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One PUT with progress. XMLHttpRequest rather than fetch, because only XHR reports upload progress.
function put(url, body, headers, onBytes, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onBytes?.(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, range: xhr.getResponseHeader("Range") });
    xhr.onerror = () => reject(new Error("network"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

// "bytes=0-12345" -> 12346 (how many bytes Cloud Storage has). null if the header is absent.
const committedFrom = (range) => {
  const m = /bytes=0-(\d+)/.exec(range || "");
  return m ? Number(m[1]) + 1 : null;
};

const transient = (status) => status === 429 || status >= 500;

// Ask Cloud Storage how much of the file it already has (used after a failure).
async function committedBytes(url, size, signal) {
  const r = await put(url, null, { "Content-Range": `bytes */${size}` }, null, signal);
  if (r.status === 200 || r.status === 201) return size;
  if (r.status === 308) return committedFrom(r.range) ?? 0;
  throw new Error(`Unexpected reply ${r.status} when checking progress`);
}

/**
 * Upload one file. `onProgress(sentBytes)` is called as bytes go out.
 * Returns what the server confirmed: { object_name, size, md5_hash, crc32c, updated }.
 */
export async function uploadFile({ file, target, onStage, onProgress, signal }) {
  const body = { ...target, size: file.size, content_type: file.type || undefined };
  onStage?.("starting");

  let session;
  try {
    session = await api("/dpr-admin/uploads/start", { method: "POST", body });
  } catch (e) {
    // Already in the bucket (e.g. an earlier attempt finished but the confirmation was lost):
    // ask the server to verify it instead of failing.
    if (e instanceof ApiError && e.status === 409 && /already exists/i.test(e.message)) {
      onStage?.("verifying");
      const done = await api("/dpr-admin/uploads/complete", { method: "POST", body: { ...target, size: file.size } });
      onProgress?.(file.size);
      return { ...done, alreadyThere: true };
    }
    throw e;
  }

  const { upload_url: url, chunk_size: chunk } = session;
  let offset = 0;
  let tries = 0;
  onStage?.("uploading");
  onProgress?.(0);

  while (offset < file.size) {
    const end = Math.min(offset + chunk, file.size);
    try {
      const res = await put(
        url,
        file.slice(offset, end),
        { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` },
        (loaded) => onProgress?.(offset + loaded),
        signal,
      );
      if (res.status === 200 || res.status === 201) { offset = file.size; break; }
      if (res.status === 308) {
        offset = committedFrom(res.range) ?? end; // trust what Cloud Storage says it holds
        onProgress?.(offset);
        tries = 0;
        continue;
      }
      if (!transient(res.status)) throw new Error(`Cloud Storage refused the upload (HTTP ${res.status})`);
      throw new Error("transient");
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      if (++tries > MAX_TRIES) throw new Error("The connection kept failing. Check your network and try again.");
      onStage?.(`retrying (${tries}/${MAX_TRIES})`);
      await sleep(Math.min(1000 * 2 ** (tries - 1), 15000));
      try { offset = await committedBytes(url, file.size, signal); } catch { /* keep our own offset */ }
      onStage?.("uploading");
      onProgress?.(offset);
    }
  }

  onProgress?.(file.size);
  onStage?.("verifying");
  // The server checks the bucket itself: the file must be there with the declared size.
  return api("/dpr-admin/uploads/complete", { method: "POST", body: { ...target, size: file.size } });
}
