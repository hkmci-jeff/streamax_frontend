import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../main.jsx";
import { api, fmtBytes, fmtDate, fmtDateTime, md5Hex } from "../api.js";
import { ErrorBox, IconData, IconOut, Logo, Pie } from "../components/ui.jsx";

const MAX_BATCH = 20;

// Browsers throttle many simultaneous downloads; start them one at a time via
// hidden iframes (bytes go straight from GCS, never through the portal).
function startDownload(url) {
  const f = document.createElement("iframe");
  f.style.display = "none";
  f.src = url;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 120_000);
}

export default function Catalog() {
  const { user, logout } = useAuth();
  const [packages, setPackages] = useState(null);
  const [contract, setContract] = useState(undefined);
  const [error, setError] = useState(null);
  const [pkgFilter, setPkgFilter] = useState("all");
  const [latestOnly, setLatestOnly] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [queue, setQueue] = useState(null);
  const [details, setDetails] = useState(null); // { pkg, ver, file } (object_name used to re-find after reload)

  const load = () =>
    api("/dpr-service/catalog").then(setPackages).catch(setError);

  useEffect(() => {
    load();
    api("/dpr-service/contract").then(setContract).catch(() => setContract(null));
  }, []);

  const rows = useMemo(() => {
    if (!packages) return [];
    const out = [];
    for (const p of packages) {
      if (pkgFilter !== "all" && p.country_key !== pkgFilter) continue;
      for (const v of p.versions) {
        if (latestOnly && !v.is_latest) continue;
        for (const f of v.files) out.push({ pkg: p, ver: v, file: f });
      }
    }
    return out;
  }, [packages, pkgFilter, latestOnly]);

  const toggle = (name) => setSelected((s) => {
    const n = new Set(s);
    n.has(name) ? n.delete(name) : n.size < MAX_BATCH && n.add(name);
    return n;
  });

  async function download(items) {
    setError(null);
    const pending = items.map((r) => ({ name: r.file.name, object_name: r.file.object_name, state: "waiting" }));
    setQueue(pending);
    try {
      const links = await api("/dpr-service/downloads", {
        method: "POST",
        body: { items: items.map((r) => ({ country_key: r.pkg.country_key, version: r.ver.version, object_name: r.file.object_name, bucket: r.pkg.bucket })) },
      });
      for (let i = 0; i < links.length; i++) {
        startDownload(links[i].url);
        setQueue((q) => q.map((x) => x.object_name === links[i].object_name ? { ...x, state: "started" } : x));
        if (i < links.length - 1) await new Promise((r) => setTimeout(r, 1200));
      }
      setSelected(new Set());
      load(); // refresh "last downloaded"
    } catch (e) {
      setError(e);
      setQueue((q) => q?.map((x) => ({ ...x, state: "failed" })));
    }
  }

  const selectedRows = rows.filter((r) => selected.has(r.file.object_name));
  const initials = (user?.name || user?.email || "?").split(/[\s@.]/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join("");

  return (
    <div className={`client${queue ? " has-queue" : ""}`}>
      <header className="topbar">
        <div className="brand"><Logo /> Data Delivery Portal</div>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end><IconData />Data</NavLink>
          <button className="btn btn-ghost btn-sm" onClick={logout} title="Sign out"><IconOut />Sign out</button>
          <span className="avatar" title={user?.email} aria-label={`Signed in as ${user?.email}`}>{initials}</span>
        </nav>
      </header>

      <main className="wrap">
        <ContractHero contract={contract} />

        <div className="section-head">
          <h2 style={{ fontSize: 22 }}>Downloads</h2>
          <div className="filters">
            <label className="muted small" style={{ display: "flex", gap: 8, alignItems: "center" }}>Package
              <select className="select pill" value={pkgFilter} onChange={(e) => setPkgFilter(e.target.value)}>
                <option value="all">All</option>
                {packages?.map((p) => <option key={p.country_key + p.bucket} value={p.country_key}>{p.label || p.country_key}</option>)}
              </select>
            </label>
            <label className="muted small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={latestOnly} onChange={(e) => setLatestOnly(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
              Latest only
            </label>
            <button className="btn btn-primary" disabled={!selectedRows.length} onClick={() => download(selectedRows)}>
              Download selected ({selectedRows.length})
            </button>
          </div>
        </div>

        <ErrorBox error={error} />
        {!packages && !error && <p className="muted">Loading your data…</p>}
        {packages && !rows.length && (
          <div className="card empty">No data is available to your account yet. New deliveries appear here as soon as they land.</div>
        )}

        <div className="rows">
          {rows.map(({ pkg, ver, file }) => (
            <div className="row" key={file.object_name}>
              <input type="checkbox" aria-label={`Select ${file.name}`} checked={selected.has(file.object_name)} onChange={() => toggle(file.object_name)} />
              <div className="main">
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <button type="button" className="pkg-name" onClick={() => setDetails({ pkg, ver, file })} aria-haspopup="dialog">
                    {pkg.label || pkg.country_key}
                  </button>
                  <span className="pill-tag mono">{ver.version}</span>
                  {ver.is_latest && <span className="pill-tag">Latest</span>}
                  {file.updated_since_my_download && file.my_last_download && <span className="pill-tag accent">Updated since your download</span>}
                </div>
                <div className="sub">{file.name} · {fmtBytes(file.size)}{file.md5_hash && <> · md5 {md5Hex(file.md5_hash)}</>}</div>
              </div>
              <div className="meta"><div className="label">Data updated</div><div>{fmtDate(file.updated)}</div></div>
              <div className="meta"><div className="label">You last downloaded</div><div className={file.my_last_download ? "" : "faint"}>{file.my_last_download ? fmtDate(file.my_last_download) : "Not yet"}</div></div>
              <button className="btn" onClick={() => download([{ pkg, ver, file }])}>Download</button>
            </div>
          ))}
        </div>
        {selected.size >= MAX_BATCH && <p className="muted small">You can select up to {MAX_BATCH} files per batch.</p>}
      </main>

      {details && (
        <PackageDetails
          {...findCurrent(packages, details)}
          onClose={() => setDetails(null)}
          onDownload={(r) => download([r])}
        />
      )}

      {queue && (
        <aside className="queue" aria-live="polite">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <strong>Downloads</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => setQueue(null)}>Close</button>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {queue.map((q) => (
              <li key={q.object_name}><span className="mono" style={{ overflowWrap: "anywhere" }}>{q.name}</span>
                <span className={q.state === "started" ? "" : "faint"} style={{ color: q.state === "failed" ? "var(--danger)" : undefined }}>
                  {q.state === "started" ? "Started" : q.state === "failed" ? "Failed" : "Waiting"}
                </span></li>
            ))}
          </ul>
          <p className="faint small" style={{ margin: "8px 0 0" }}>If your browser asks to allow multiple downloads, choose Allow.</p>
        </aside>
      )}
    </div>
  );
}

function ContractHero({ contract }) {
  const year = new Date().getFullYear();
  if (contract === undefined) return <section className="hero"><div className="pie" style={{ background: "var(--panel)" }} /></section>;
  if (!contract) {
    return (
      <section className="hero">
        <h1 className="eyebrow">{year} commitment</h1>
        <Pie pct={0} label="No contract figures yet" />
        <div className="muted small">Contract figures haven't been entered yet.</div>
      </section>
    );
  }
  return (
    <section className="hero" aria-labelledby="contract-h">
      <h1 id="contract-h" className="eyebrow">{contract.year} commitment</h1>
      <Pie pct={contract.percent} label={`${contract.reported} of ${contract.committed} assets reported, ${contract.percent ?? 0} percent`} />
      <div>
        <div className="big-num">{contract.reported}<span style={{ color: "#5c6763" }}> / {contract.committed}</span></div>
        <div className="muted small" style={{ marginTop: 10 }}>assets reported to MCI · as of {fmtDate(contract.as_of)}</div>
        {contract.notes && <div className="faint small" style={{ marginTop: 8, maxWidth: 480 }}>{contract.notes}</div>}
      </div>
    </section>
  );
}

// After a reload (e.g. a download updated "last downloaded"), show fresh data.
function findCurrent(packages, d) {
  for (const p of packages || []) {
    if (p.country_key !== d.pkg.country_key || p.bucket !== d.pkg.bucket) continue;
    for (const v of p.versions) {
      if (v.version !== d.ver.version) continue;
      const f = v.files.find((x) => x.object_name === d.file.object_name);
      if (f) return { pkg: p, ver: v, file: f };
    }
  }
  return d;
}

function PackageDetails({ pkg, ver, file, onClose, onDownload }) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef(null);
  const md5 = md5Hex(file.md5_hash);

  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  async function copy() {
    try { await navigator.clipboard.writeText(md5); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }

  const verifyCmd = `md5sum ${file.name}`;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="details-h">
        <div className="drawer-head">
          <div>
            <div className="faint small">{pkg.label ? pkg.country_key : "Package"}</div>
            <h2 id="details-h" style={{ fontSize: 22, marginTop: 2 }}>{pkg.label || pkg.country_key}</h2>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span className="pill-tag mono">{ver.version}</span>
              {ver.is_latest && <span className="pill-tag">Latest</span>}
              {file.updated_since_my_download && file.my_last_download && <span className="pill-tag accent">Updated since your download</span>}
            </div>
          </div>
          <button ref={closeRef} className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close details">Close</button>
        </div>

        <div className="drawer-body">
          <section aria-labelledby="file-h">
            <h3 id="file-h" className="eyebrow" style={{ textAlign: "left", marginBottom: 12 }}>File</h3>
            <dl className="kv">
              <dt>File name</dt><dd className="mono">{file.name}</dd>
              <dt>Size</dt><dd>{fmtBytes(file.size)}{file.size != null && <span className="faint"> · {file.size.toLocaleString("en-GB")} bytes</span>}</dd>
              <dt>MD5</dt>
              <dd>
                {md5 ? (
                  <div className="copy-row">
                    <span className="mono">{md5}</span>
                    <button type="button" className="btn btn-sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
                  </div>
                ) : <span className="faint">Not available</span>}
              </dd>
              {md5 && <><dt>Check after download</dt><dd><span className="mono">{verifyCmd}</span><div className="faint small">The result should match the MD5 above.</div></dd></>}
              <dt>Storage path</dt><dd className="mono faint">{pkg.bucket}/{file.object_name}</dd>
            </dl>
          </section>

          <section aria-labelledby="dates-h">
            <h3 id="dates-h" className="eyebrow" style={{ textAlign: "left", marginBottom: 12 }}>Dates</h3>
            <dl className="kv">
              <dt>Data updated</dt><dd>{fmtDateTime(file.updated)}</dd>
              <dt>You last downloaded</dt><dd className={file.my_last_download ? "" : "faint"}>{file.my_last_download ? fmtDateTime(file.my_last_download) : "Not yet"}</dd>
              <dt>Your team last downloaded</dt><dd className={file.org_last_download ? "" : "faint"}>{file.org_last_download ? fmtDateTime(file.org_last_download) : "Not yet"}</dd>
            </dl>
          </section>

          {ver.files.length > 1 && (
            <section aria-labelledby="ver-h">
              <h3 id="ver-h" className="eyebrow" style={{ textAlign: "left", marginBottom: 12 }}>Everything in {ver.version}</h3>
              <ul className="file-list">
                {ver.files.map((f) => (
                  <li key={f.object_name} className={f.object_name === file.object_name ? "current" : ""}>
                    <span className="mono" style={{ overflowWrap: "anywhere" }}>{f.name}</span>
                    <span className="faint" style={{ whiteSpace: "nowrap" }}>{fmtBytes(f.size)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="drawer-foot">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => onDownload({ pkg, ver, file })}>Download {fmtBytes(file.size)}</button>
        </div>
      </aside>
    </>
  );
}
