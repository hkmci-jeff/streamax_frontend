import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { useAuth } from "../main.jsx";
import { api, fmtDate, fmtDateTime } from "../api.js";
import { ErrorBox, IconClients, IconData, IconList, IconOut, IconPie, IconUp, Logo, Pie } from "../components/ui.jsx";

const thisYear = new Date().getFullYear();

function useLoad(fn, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const reload = () => fn().then((d) => { setData(d); setError(null); }).catch(setError);
  useEffect(() => { reload(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return [data, error, reload, setError];
}

export function AdminLayout() {
  const { logout } = useAuth();
  return (
    <div className="admin">
      <nav className="side" aria-label="Admin">
        <div className="brand"><Logo size={18} />Delivery Portal Admin</div>
        <NavLink to="/admin" end><IconClients />Clients</NavLink>
        <NavLink to="/admin/contracts"><IconPie />Contract metrics</NavLink>
        <NavLink to="/admin/upload"><IconUp />Upload data</NavLink>
        <NavLink to="/admin/audit"><IconList />Download log</NavLink>
        <NavLink to="/admin/buckets"><IconData />Buckets</NavLink>
        <div className="spacer" />
        <button className="btn btn-ghost" style={{ justifyContent: "flex-start", color: "var(--muted)" }} onClick={logout}><IconOut />Sign out</button>
      </nav>
      <main><Outlet /></main>
    </div>
  );
}

// ── Clients list ────────────────────────────────────────────────────────────

export function AdminClients() {
  const [orgs, error, reload, setError] = useLoad(() => api("/dpr-admin/orgs"), []);
  const [name, setName] = useState("");

  async function create(e) {
    e.preventDefault();
    try { await api("/dpr-admin/orgs", { method: "POST", body: { name } }); setName(""); reload(); }
    catch (err) { setError(err); }
  }

  return (
    <>
      <div className="page-head"><h1>Clients</h1></div>
      <ErrorBox error={error} />
      <form className="card card-head" onSubmit={create}>
        <label className="field" style={{ flex: "1 1 260px" }}>New client organisation
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" />
        </label>
        <button className="btn btn-primary" style={{ alignSelf: "flex-end" }}>Create client</button>
      </form>
      <div className="card table-wrap">
        <table className="t" style={{ minWidth: 560 }}>
          <thead><tr><th>Client</th><th>Status</th><th>Data access</th><th>Versions shown</th></tr></thead>
          <tbody>
            {orgs?.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/admin/clients/${o.id}`} style={{ fontWeight: 600 }}>{o.name}</Link></td>
                <td><span className={`status ${o.status}`}>{o.status === "revoked" ? "Revoked" : "Active"}</span></td>
                <td className="muted">{(o.entitlements || []).map((e) => e.label || e.country_key).join(", ") || "None yet"}</td>
                <td className="muted">{o.versions_visible ? `Latest ${o.versions_visible}` : "All"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {orgs && !orgs.length && <div className="empty">No clients yet. Create one above.</div>}
      </div>
    </>
  );
}

// ── Single client ───────────────────────────────────────────────────────────

export function AdminClient() {
  const { orgId } = useParams();
  const [org, error, reloadOrg, setError] = useLoad(() => api(`/dpr-admin/orgs/${orgId}`), [orgId]);
  const [users, , reloadUsers] = useLoad(() => api(`/dpr-admin/orgs/${orgId}/users`), [orgId]);
  const [status, statusErr, reloadStatus] = useLoad(() => api(`/dpr-admin/orgs/${orgId}/delivery-status`), [orgId]);
  const [buckets] = useLoad(() => api("/dpr-admin/buckets"), []);
  const [notice, setNotice] = useState(null);
  const [invite, setInvite] = useState({ email: "", name: "" });
  const [ent, setEnt] = useState({ country_key: "", label: "", bucket: "delivery" });

  const run = async (fn) => { setError(null); setNotice(null); try { await fn(); } catch (e) { setError(e); } };

  if (!org) return <><ErrorBox error={error} />{!error && <p className="muted">Loading…</p>}</>;
  const revoked = org.status === "revoked";

  const saveEntitlements = (list) => run(async () => {
    await api(`/dpr-admin/orgs/${orgId}/entitlements`, { method: "PUT", body: { entitlements: list } });
    reloadOrg(); reloadStatus();
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small muted"><Link to="/admin">Clients</Link> / {org.name}</div>
          <h1 style={{ marginTop: 4 }}>{org.name}</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className={`status ${org.status}`}>{revoked ? "Revoked" : "Active"}</span>
          <button
            className={`btn ${revoked ? "" : "btn-danger"}`}
            onClick={() => {
              if (!revoked && !confirm(`Revoke all access for ${org.name}? Their users will be locked out immediately.`)) return;
              run(async () => { await api(`/dpr-admin/orgs/${orgId}`, { method: "PATCH", body: { status: revoked ? "active" : "revoked" } }); reloadOrg(); });
            }}
          >{revoked ? "Restore access" : "Revoke access"}</button>
        </div>
      </div>
      <ErrorBox error={error} />
      {notice && <div className="notice" role="status">{notice}</div>}

      {/* Users */}
      <section className="card" aria-labelledby="users-h">
        <div className="card-head"><h2 id="users-h" style={{ fontSize: 16 }}>Users</h2></div>
        <form className="card-body inline-form" onSubmit={(e) => { e.preventDefault(); run(async () => {
          const d = await api(`/dpr-admin/orgs/${orgId}/users`, { method: "POST", body: { email: invite.email, name: invite.name || null } });
          setInvite({ email: "", name: "" }); reloadUsers();
          setNotice(<>Invited {d.user.email}. Send them this one-time link to set their password: <a href={d.password_setup_link} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere" }}>{d.password_setup_link}</a></>);
        }); }}>
          <label className="field">Email<input className="input" type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></label>
          <label className="field">Name (optional)<input className="input" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></label>
          <button className="btn btn-primary">Invite user</button>
        </form>
        <div className="table-wrap">
          <table className="t" style={{ minWidth: 560 }}>
            <thead><tr><th>Email</th><th>Name</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
            <tbody>
              {users?.map((u) => {
                const inactive = u.status === "inactive";
                return (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td className="muted">{u.name || "—"}</td>
                    <td className={inactive ? "faint" : ""}>{inactive ? "Disabled" : "Active"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => run(async () => {
                        const d = await api(`/dpr-admin/users/${u.id}/password-reset-link`, { method: "POST" });
                        setNotice(<>Password reset link for {d.email}: <a href={d.password_reset_link} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere" }}>{d.password_reset_link}</a></>);
                      })}>Reset password</button>
                      <button className={`btn btn-sm ${inactive ? "btn-ghost" : "btn-ghost"}`} style={{ color: inactive ? undefined : "var(--danger)" }} onClick={() => run(async () => {
                        await api(`/dpr-service/users/${u.id}`, { method: "PATCH", body: { status: inactive ? "active" : "inactive" } }); reloadUsers();
                      })}>{inactive ? "Enable" : "Disable"}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users && !users.length && <div className="empty">No users yet.</div>}
        </div>
      </section>

      {/* Entitlements */}
      <section className="card" aria-labelledby="ent-h">
        <div className="card-head">
          <div>
            <h2 id="ent-h" style={{ fontSize: 16 }}>Data access</h2>
            <p className="muted small" style={{ margin: "4px 0 0" }}>Each entry grants every version folder under that top-level bucket folder.</p>
          </div>
          <label className="muted small" style={{ display: "flex", gap: 8, alignItems: "center" }}>Versions shown
            <select className="select pill" value={org.versions_visible ?? 3} onChange={(e) => run(async () => {
              await api(`/dpr-admin/orgs/${orgId}`, { method: "PATCH", body: { versions_visible: Number(e.target.value) } }); reloadOrg();
            })}>
              {[...new Set([1, 2, 3, 5, 10, org.versions_visible ?? 3])].filter((n) => n > 0).sort((a, b) => a - b)
                .map((n) => <option key={n} value={n}>Latest {n}</option>)}
              <option value={0}>Full history</option>
            </select>
          </label>
        </div>
        <form className="card-body inline-form" onSubmit={(e) => { e.preventDefault(); saveEntitlements([...(org.entitlements || []), { ...ent, label: ent.label || null }]); setEnt({ country_key: "", label: "", bucket: "delivery" }); }}>
          <label className="field">Bucket folder<input className="input mono" required placeholder="GLOBAL.HKG" value={ent.country_key} onChange={(e) => setEnt({ ...ent, country_key: e.target.value })} /></label>
          <label className="field">Display name (optional)<input className="input" placeholder="Hong Kong · OS" value={ent.label} onChange={(e) => setEnt({ ...ent, label: e.target.value })} /></label>
          <label className="field" style={{ flex: "0 1 180px" }}>Bucket
            <select className="select" value={ent.bucket} onChange={(e) => setEnt({ ...ent, bucket: e.target.value })}>
              {(buckets || [{ alias: "delivery" }]).map((b) => <option key={b.alias} value={b.alias}>{b.label || b.alias}</option>)}
            </select>
          </label>
          <button className="btn">Add access</button>
        </form>
        <div className="table-wrap">
          <table className="t" style={{ minWidth: 760 }}>
            <thead><tr><th>Access</th><th>Latest version</th><th>Uploaded</th><th>Client last requested</th><th /></tr></thead>
            <tbody>
              {(org.entitlements || []).map((e, i) => {
                const s = status?.find((x) => x.country_key === e.country_key && x.bucket === e.bucket);
                return (
                  <tr key={e.country_key + e.bucket}>
                    <td><div style={{ fontWeight: 500 }}>{e.label || e.country_key}</div><div className="sub">{e.bucket}/{e.country_key}/</div></td>
                    <td className="mono">{s ? s.latest_version || "—" : "…"}</td>
                    <td className="muted">{s ? fmtDateTime(s.uploaded_at) : "…"}</td>
                    <td style={{ color: s && !s.last_requested_at && s.latest_version ? "var(--accent-text)" : undefined }}>
                      {s ? (s.last_requested_at ? fmtDateTime(s.last_requested_at) : "Not yet") : "…"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} aria-label={`Remove ${e.label || e.country_key}`}
                        onClick={() => saveEntitlements(org.entitlements.filter((_, j) => j !== i))}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!org.entitlements?.length && <div className="empty">No data access yet. Add a bucket folder above.</div>}
          {statusErr && <div className="card-body"><ErrorBox error={statusErr} /></div>}
        </div>
      </section>

      <ContractEditor orgId={orgId} />
    </>
  );
}

// ── Contract editor (per client) ────────────────────────────────────────────

function ContractEditor({ orgId }) {
  const [year, setYear] = useState(thisYear);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const [history, setHistory] = useState(null); // null = hidden, [] = loaded

  const loadHistory = () =>
    api(`/dpr-admin/orgs/${orgId}/contracts/${year}/history`).then(setHistory).catch(setError);

  useEffect(() => {
    setForm(null); setSaved(null); setHistory(null);
    api(`/dpr-admin/contracts?year=${year}`)
      .then((rows) => {
        const c = rows.find((r) => r.org_id === orgId);
        setForm({
          committed: c?.committed ?? "", reported: c?.reported ?? "", as_of: c?.as_of ?? new Date().toISOString().slice(0, 10),
          contract_number: c?.contract_number ?? "", term_start: c?.term_start ?? `${year}-01-01`, term_end: c?.term_end ?? `${year}-12-31`,
          notes: c?.notes ?? "", updated_by: c?.updated_by, updated_at: c?.updated_at,
        });
      })
      .catch(setError);
  }, [orgId, year]);

  async function save(e) {
    e.preventDefault(); setError(null);
    try {
      const body = { ...form, committed: Number(form.committed), reported: Number(form.reported) };
      ["contract_number", "term_start", "term_end", "notes"].forEach((k) => { if (!body[k]) body[k] = null; });
      delete body.updated_by; delete body.updated_at;
      const c = await api(`/dpr-admin/orgs/${orgId}/contracts/${year}`, { method: "PUT", body });
      setForm((f) => ({ ...f, updated_by: c.updated_by, updated_at: c.updated_at })); setSaved(c);
      if (history) loadHistory();
    } catch (err) { setError(err); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const pct = form && Number(form.committed) ? Math.round((100 * Number(form.reported)) / Number(form.committed)) : 0;

  return (
    <form className="card" onSubmit={save} aria-labelledby="contract-h">
      <div className="card-head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Pie className="mini-pie" pct={pct} size={28} />
          <h2 id="contract-h" style={{ fontSize: 16 }}>Contract metrics</h2>
        </div>
        <label className="muted small" style={{ display: "flex", gap: 8, alignItems: "center" }}>Year
          <select className="select pill" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ErrorBox error={error} />
        {!form ? <p className="muted">Loading…</p> : (
          <>
            <div className="grid3">
              <label className="field">Assets reported to MCI<input className="input mono" type="number" min="0" required value={form.reported} onChange={set("reported")} /></label>
              <label className="field">As of date<input className="input" type="date" required value={form.as_of} onChange={set("as_of")} /></label>
              <label className="field">Committed for {year}<input className="input mono" type="number" min="0" required value={form.committed} onChange={set("committed")} /></label>
              <label className="field">Contract number<input className="input" value={form.contract_number} onChange={set("contract_number")} /></label>
              <label className="field">Term start<input className="input" type="date" value={form.term_start} onChange={set("term_start")} /></label>
              <label className="field">Term end<input className="input" type="date" value={form.term_end} onChange={set("term_end")} /></label>
            </div>
            <label className="field">Note shown to client (optional)<textarea className="input" rows={2} value={form.notes} onChange={set("notes")} /></label>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span className="faint small">{form.updated_at ? `Last saved ${fmtDateTime(form.updated_at)} by ${form.updated_by}` : "Not entered yet"}{saved && " · Saved"}</span>
              <div style={{ display: "flex", gap: 10 }}>
                {form.updated_at && (
                  <button type="button" className="btn" aria-expanded={!!history}
                    onClick={() => (history ? setHistory(null) : loadHistory())}>
                    {history ? "Hide history" : "History"}
                  </button>
                )}
                <button className="btn btn-primary">Save</button>
              </div>
            </div>
            {history && (
              <div className="history">
                <h3 className="small muted" style={{ fontWeight: 500, marginBottom: 8 }}>Every save for {year}, newest first</h3>
                <div className="table-wrap">
                  <table className="t" style={{ minWidth: 560 }}>
                    <thead><tr><th>Saved</th><th>By</th><th>Reported / committed</th><th>As of</th></tr></thead>
                    <tbody>
                      {history.map((h, i) => {
                        const prev = history[i + 1];
                        const changed = prev && (prev.reported !== h.reported || prev.committed !== h.committed);
                        return (
                          <tr key={h.id || i}>
                            <td>{fmtDateTime(h.updated_at)}</td>
                            <td className="muted">{h.updated_by || "—"}</td>
                            <td className="mono">
                              {h.reported} / {h.committed}
                              {changed && <span className="faint"> (was {prev.reported} / {prev.committed})</span>}
                            </td>
                            <td>{fmtDate(h.as_of)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!history.length && <div className="empty">No earlier saves recorded for {year}.</div>}
              </div>
            )}
          </>
        )}
      </div>
    </form>
  );
}

// ── Contracts overview ──────────────────────────────────────────────────────

export function AdminContracts() {
  const [year, setYear] = useState(thisYear);
  const [rows, error] = useLoad(() => api(`/dpr-admin/contracts?year=${year}`), [year]);
  return (
    <>
      <div className="page-head">
        <h1>Contract metrics · {year}</h1>
        <label className="muted small" style={{ display: "flex", gap: 8, alignItems: "center" }}>Year
          <select className="select pill" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Entered manually on each client's page. Each client sees only their own figures.</p>
      <ErrorBox error={error} />
      <div className="card table-wrap">
        <table className="t" style={{ minWidth: 640 }}>
          <thead><tr><th>Client</th><th>Reported / committed</th><th>As of</th><th>Last edited</th></tr></thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/admin/clients/${r.org_id}`} style={{ fontWeight: 500 }}>{r.org_name || r.org_id}</Link></td>
                <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Pie className="mini-pie" pct={r.percent} />
                  <span className="mono">{r.reported} / {r.committed}</span>
                  <span className="muted">{r.percent ?? "—"}%</span>
                </div></td>
                <td className="muted">{fmtDate(r.as_of)}</td>
                <td className="muted">{r.updated_by} · {fmtDate(r.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && !rows.length && <div className="empty">No contract figures entered for {year}.</div>}
      </div>
    </>
  );
}

// ── Download log ────────────────────────────────────────────────────────────

export function AdminAudit() {
  const [orgs] = useLoad(() => api("/dpr-admin/orgs"), []);
  const [orgId, setOrgId] = useState("");
  const [rows, error] = useLoad(() => api(`/dpr-admin/downloads${orgId ? `?org_id=${orgId}` : ""}`), [orgId]);
  const names = Object.fromEntries((orgs || []).map((o) => [o.id, o.name]));

  function exportCsv() {
    const cols = ["issued_at", "org", "email", "bucket", "country_key", "version", "object_name", "size", "ip"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(c === "org" ? names[r.org_id] || r.org_id : r[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `download-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="page-head">
        <h1>Download log</h1>
        <div className="filters">
          <select className="select pill" aria-label="Client" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">All clients</option>
            {orgs?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button className="btn" disabled={!rows?.length} onClick={exportCsv}>Export CSV</button>
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Each row is a download link issued to a client (latest 200). Confirmed completion from GCS access logs is a later milestone.</p>
      <ErrorBox error={error} />
      <div className="card table-wrap">
        <table className="t" style={{ minWidth: 760 }}>
          <thead><tr><th>When</th><th>Client</th><th>User</th><th>File</th><th>IP</th></tr></thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.issued_at)}</td>
                <td>{names[r.org_id] || r.org_id}</td>
                <td className="muted">{r.email}</td>
                <td className="mono small" style={{ overflowWrap: "anywhere" }}>{r.object_name}</td>
                <td className="mono small muted">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && !rows.length && <div className="empty">No downloads yet.</div>}
      </div>
    </>
  );
}

// ── Buckets ─────────────────────────────────────────────────────────────────

export function AdminBuckets() {
  const [buckets, error, reload, setError] = useLoad(() => api("/dpr-admin/buckets"), []);
  const [form, setForm] = useState({ alias: "", bucket_name: "", label: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  async function add(e) {
    e.preventDefault(); setError(null); setNotice(null); setBusy(true);
    try {
      const b = await api("/dpr-admin/buckets", {
        method: "POST",
        body: { alias: form.alias.trim().toLowerCase(), bucket_name: form.bucket_name.trim().replace(/^gs:\/\//, ""), label: form.label.trim() || null },
      });
      setForm({ alias: "", bucket_name: "", label: "" });
      setNotice(`Added "${b.label || b.alias}". You can now pick it when giving a client data access.`);
      reload();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  async function remove(b) {
    if (!confirm(`Remove the bucket "${b.label || b.alias}" from the portal? The data in GCS is not touched.`)) return;
    setError(null); setNotice(null);
    try { await api(`/dpr-admin/buckets/${encodeURIComponent(b.alias)}`, { method: "DELETE" }); reload(); }
    catch (err) { setError(err); }
  }

  return (
    <>
      <div className="page-head">
        <h1>Buckets</h1>
        <p className="muted small" style={{ margin: 0, maxWidth: 560 }}>
          The GCS buckets the portal can deliver from. Register a client's bucket here, then grant folders in it from that client's page.
        </p>
      </div>
      <ErrorBox error={error} />
      {notice && <div className="notice" role="status">{notice}</div>}

      <form className="card" onSubmit={add} aria-labelledby="add-bucket-h">
        <div className="card-head"><h2 id="add-bucket-h" style={{ fontSize: 16 }}>Add a bucket</h2></div>
        <div className="card-body inline-form">
          <label className="field">GCS bucket name
            <input className="input mono" required placeholder="acme-deliveries" value={form.bucket_name}
              onChange={(e) => setForm({ ...form, bucket_name: e.target.value })} />
          </label>
          <label className="field" style={{ flex: "0 1 180px" }}>Short name
            <input className="input mono" required pattern="[a-z0-9][a-z0-9\-]{1,39}" title="Lowercase letters, numbers and dashes"
              placeholder="acme" value={form.alias} onChange={(e) => setForm({ ...form, alias: e.target.value.toLowerCase() })} />
          </label>
          <label className="field">Display name (optional)
            <input className="input" placeholder="ACME deliveries" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </label>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Checking access…" : "Add bucket"}</button>
        </div>
        <p className="faint small" style={{ margin: "0 20px 16px" }}>
          The portal checks it can read the bucket before saving. If it can't, grant the portal's service account
          the Storage Object Viewer role on that bucket in Google Cloud, then try again.
        </p>
      </form>

      <div className="card table-wrap">
        <table className="t" style={{ minWidth: 640 }}>
          <thead><tr><th>Name</th><th>GCS bucket</th><th>Used by</th><th></th></tr></thead>
          <tbody>
            {buckets?.map((b) => (
              <tr key={b.alias}>
                <td><div style={{ fontWeight: 500 }}>{b.label || b.alias}</div><div className="sub">{b.alias}{b.builtin && " · built in"}</div></td>
                <td className="mono">gs://{b.bucket_name}</td>
                <td className={b.used_by.length ? "" : "faint"}>{b.used_by.length ? b.used_by.join(", ") : "No clients yet"}</td>
                <td style={{ textAlign: "right" }}>
                  {b.builtin
                    ? <span className="faint small">Set in server config</span>
                    : <button className="btn btn-ghost btn-sm" style={{ color: b.used_by.length ? undefined : "var(--danger)" }}
                        disabled={b.used_by.length > 0} title={b.used_by.length ? "Remove clients' access to it first" : undefined}
                        onClick={() => remove(b)}>Remove</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!buckets && !error && <p className="muted" style={{ padding: 20 }}>Loading…</p>}
      </div>
    </>
  );
}
