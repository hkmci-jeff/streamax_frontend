export function Logo({ size = 20 }) {
  return (
    <svg width={Math.round(size * 1.14)} height={size} viewBox="0 0 2000 1749" aria-hidden="true">
      <path fill="#F89A1F" d="M0 1749C60 900 800 100 1870 0C1400 110 1240 450 1217 745L1842 744L1507 1749Z" />
      <path fill="#F89A1F" d="M1356 644C1380 300 1650 80 2000 63C1850 95 1785 200 1775 311L1990 311L1875 644Z" />
    </svg>
  );
}

const icon = (children) => () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const IconData = icon(<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>);
export const IconDocs = icon(<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 13h8M8 17h5" /></>);
export const IconClients = icon(<><circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7" /><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-1.8-5.6-4.5-6.6" /></>);
export const IconPie = icon(<><path d="M21 12A9 9 0 1 1 12 3v9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></>);
export const IconClock = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconList = icon(<><path d="M9 6h12M9 12h12M9 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>);
export const IconUp = icon(<><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 20h16" /></>);
export const IconOut = icon(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>);

export function Pie({ pct, size, className = "pie", label }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={{
        ...(size ? { width: size, height: size } : {}),
        background: `conic-gradient(var(--accent) 0 ${p}%, var(--panel-2) 0 100%)`,
        boxShadow: className === "pie" ? "0 0 80px rgba(248,154,31,.13)" : undefined,
      }}
    />
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="error" role="alert">{error.message || String(error)}</div>;
}
