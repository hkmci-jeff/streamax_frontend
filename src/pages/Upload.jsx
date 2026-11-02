import { useEffect, useMemo, useRef, useState } from "react";
import { api, fmtBytes, fmtDateTime, md5Hex } from "../api.js";
import { ErrorBox } from "../components/ui.jsx";
import { uploadFile } from "../upload.js";

const VERSION_RE = /^v[0-9]+(\.[0-9]+){0,3}$/;
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const fileNameProblem = (p) => {
  const parts = p.split("/");
  if (!p || p.length > 250 || parts.length > 5 || !parts.every((s) => SEGMENT_RE.test(s)))
    return "Use only letters, digits, . _ - (starting with a letter or digit), up to 5 folders deep";
  return null;
};

// One row per file the admin has chosen.
let nextId = 1;
const toRow = (file, path) => ({ id: nextId++, file, path, stage: "waiting", sent: 0, result: null, error: null });

export default function AdminUpload() {
  const [folders, setFolders] = useState([]);
  const [folder, setFolder] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [version, setVersion] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [recent, setRecent] = useState(null);
  const abortRef = useRef(null);

  const loadRecent = () => api("/dpr-admin/uploads?limit=15").then(setRecent).catch(() => setRecent([]));
  useEffect(() => {
    api("/dpr-service/gcs/folders").then((d) => { setFolders(d.folders || []); if (d.folders?.[0]) setFolder(d.folders[0]); })
      .catch((e) => { setError(e); setFolder("__new"); });
    loadRecent();
  }, []);

  // Leaving the page mid-upload would cancel it: warn first.
  useEffect(() => {
    if (!busy) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const folderName = folder === "__new" ? newFolder.trim() : folder;
  const folderProblem = folderName && !SEGMENT_RE.test(folderName) ? "Letters, digits, . _ - only, starting with a letter or digit" : null;
  const versionProblem = version && !VERSION_RE.test(version.trim()) ? "Should look like v26290.000" : null;
  const isNewFolder = folderName && !folders.includes(folderName);

  const problems = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, fileNameProblem(r.path)])), [rows]);
  const duplicates = useMemo(() => {
    const seen = new Set(), dup = new Set();
    rows.forEach((r) => (seen.has(r.path) ? dup.add(r.path) : seen.add(r.path)));
    return dup;
  }, [rows]);
  const ready = folderName && !folderProblem && version && !versionProblem && rows.length > 0
    && rows.every((r) => !problems[r.id]) && !duplicates.size;

  const patch = (id, p) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  function addFiles(list, keepFolders) {
    const added = [...list].map((f) => {
      // A chosen directory keeps its sub-folder structure (minus the top directory's own name).
      const rel = keepFolders && f.webkitRelativePath ? f.webkitRelativePath.split("/").slice(1).join("/") : f.name;
      return toRow(f, rel);
    });
    setRows((rs) => [...rs, ...added]);
  }

  async function start(only) {
    setError(null); setBusy(true);
    const ctl = new AbortController(); abortRef.current = ctl;
    const todo = rows.filter((r) => (only ? only.includes(r.id) : r.stage !== "done"));
    for (const r of todo) {
      patch(r.id, { stage: "starting", sent: 0, error: null });
      try {
        const result = await uploadFile({
          file: r.file,
          target: { country_key: folderName, version: version.trim(), file_name: r.path, bucket: "delivery" },
          onStage: (stage) => patch(r.id, { stage }),
          onProgress: (sent) => patch(r.id, { sent }),
          signal: ctl.signal,
        });
        patch(r.id, { stage: "done", sent: r.file.size, result });
      } catch (e) {
        if (e?.name === "AbortError") { patch(r.id, { stage: "cancelled" }); break; }
        patch(r.id, { stage: "failed", error: e.message || String(e) });
      }
    }
    abortRef.current = null; setBusy(false); loadRecent();
  }

  const total = rows.reduce((n, r) => n + r.file.size, 0);
  const sent = rows.reduce((n, r) => n + r.sent, 0);
  const done = rows.filter((r) => r.stage === "done").length;
  const failed = rows.filter((r) => r.stage === "failed");
  const label = {
    waiting: "Waiting", starting: "Starting…", uploading: "Uploading", verifying: "Checking in the bucket…",
    done: "Done", failed: "Failed", cancelled: "Cancelled",
  };

  return (
    <>
      <div className="page-head"><h1>Upload data</h1></div>
      <p className="muted small" style={{ margin: 0 }}>
        Files go straight to Cloud Storage and show up for clients holding the folder within about 20 seconds.
        An upload <b>never replaces</b> a file that already exists: to correct data, upload it as a new version.
      </p>
      <ErrorBox error={error} />

      <section className="card" aria-labelledby="up-h">
        <div className="card-head"><h2 id="up-h" style={{ fontSize: 16 }}>Where to put it</h2></div>
        <div className="card-body">
          <div className="grid3">
            <label className="field">Folder
              <select className="select" value={folder} disabled={busy} onChange={(e) => setFolder(e.target.value)}>
                {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                <option value="__new">New folder…</option>
              </select>
              {folder === "__new" && <input className="input mono" placeholder="e.g. GLOBAL.HKG" value={newFolder} disabled={busy} onChange={(e) => setNewFolder(e.target.value)} />}
              {folderProblem && <span className="problem">{folderProblem}</span>}
              {isNewFolder && !folderProblem && <span className="faint small">New folder: nobody sees it until you grant a client access.</span>}
            </label>
            <label className="field">Version
              <input className="input mono" placeholder="v26290.000" value={version} disabled={busy} onChange={(e) => setVersion(e.target.value)} />
              {versionProblem && <span className="problem">{versionProblem}</span>}
            </label>
            <div className="field">Files
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label className="btn btn-sm" style={{ cursor: busy ? "default" : "pointer" }}>Add files
                  <input type="file" multiple hidden disabled={busy} onChange={(e) => { addFiles(e.target.files, false); e.target.value = ""; }} />
                </label>
                <label className="btn btn-sm" style={{ cursor: busy ? "default" : "pointer" }}>Add a folder
                  <input type="file" hidden webkitdirectory="" directory="" disabled={busy} onChange={(e) => { addFiles(e.target.files, true); e.target.value = ""; }} />
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="card" aria-label="Files to upload">
          <div className="card-head">
            <div>
              <h2 style={{ fontSize: 16 }}>{rows.length} file{rows.length === 1 ? "" : "s"} · {fmtBytes(total)}</h2>
              {folderName && version && <p className="muted small mono" style={{ margin: "4px 0 0" }}>{folderName}/{version.trim()}/</p>}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {busy
                ? <button className="btn btn-danger" onClick={() => abortRef.current?.abort()}>Cancel</button>
                : <>
                    {failed.length > 0 && <button className="btn" onClick={() => start(failed.map((r) => r.id))}>Retry failed ({failed.length})</button>}
                    <button className="btn" onClick={() => setRows([])}>Clear</button>
                    <button className="btn btn-primary" disabled={!ready || done === rows.length} onClick={() => start()}>
                      {done ? `Upload remaining (${rows.length - done})` : "Start upload"}
                    </button>
                  </>}
            </div>
          </div>
          {(busy || done > 0) && (
            <div className="card-body"><div className="bar" aria-label="Overall progress"><span style={{ width: `${total ? (100 * sent) / total : 0}%` }} /></div>
              <p className="faint small" style={{ margin: "6px 0 0" }}>{done} of {rows.length} done · {fmtBytes(sent)} of {fmtBytes(total)}</p></div>
          )}
          <div className="table-wrap">
            <table className="t" style={{ minWidth: 640 }}>
              <thead><tr><th>File</th><th>Size</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="mono small" style={{ overflowWrap: "anywhere" }}>{r.path}</div>
                      {problems[r.id] && <div className="problem">{problems[r.id]}</div>}
                      {duplicates.has(r.path) && <div className="problem">Two files have this name</div>}
                    </td>
                    <td className="muted">{fmtBytes(r.file.size)}</td>
                    <td style={{ minWidth: 220 }}>
                      {r.stage === "uploading" || r.stage.startsWith("retrying")
                        ? <><div className="bar"><span style={{ width: `${(100 * r.sent) / r.file.size}%` }} /></div>
                            <div className="faint small">{r.stage.startsWith("retrying") ? <span style={{ color: "var(--accent-text)" }}>Connection problem, {r.stage}</span> : `${Math.round((100 * r.sent) / r.file.size)}%`}</div></>
                        : <span className={r.stage === "failed" ? "problem" : r.stage === "done" ? "ok" : "muted"}>{label[r.stage] || r.stage}</span>}
                      {r.error && <div className="problem small">{r.error}</div>}
                      {r.result && <div className="faint small mono" style={{ overflowWrap: "anywhere" }}>
                        {r.result.alreadyThere ? "Already in the bucket, verified. " : ""}md5 {md5Hex(r.result.md5_hash)}</div>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {!busy && r.stage !== "done" && <button className="btn btn-ghost btn-sm" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>Remove</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="recent-h">
        <div className="card-head"><h2 id="recent-h" style={{ fontSize: 16 }}>Recent uploads</h2></div>
        <div className="table-wrap">
          <table className="t" style={{ minWidth: 640 }}>
            <thead><tr><th>When</th><th>By</th><th>File</th><th>Size</th></tr></thead>
            <tbody>
              {recent?.map((u) => (
                <tr key={u.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(u.at)}</td>
                  <td className="muted">{u.admin_email}</td>
                  <td className="mono small" style={{ overflowWrap: "anywhere" }}>{u.object_name}</td>
                  <td className="muted">{fmtBytes(u.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent && !recent.length && <div className="empty">No uploads recorded yet.</div>}
        </div>
      </section>
    </>
  );
}
