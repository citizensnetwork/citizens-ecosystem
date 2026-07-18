// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — shared UI primitives (window.UI)
//  ------------------------------------------------------------------
//  Design law: inline styles only, Citizens DS var(--*) tokens, 18px
//  card radius, 1px hairline borders, generous space, Manrope. Icons are
//  a small inline-SVG set (stroke = currentColor) — no icon CDN.
// ════════════════════════════════════════════════════════════════════
(() => {
  const paths = {
    home: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
    grid: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
    eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
    chevron: "m6 9 6 6 6-6",
    map: "M9 20 3 17V4l6 3 6-3 6 3v13l-6-3-6 3z M9 7v13 M15 4v13",
    activity: "M22 12h-4l-3 9L9 3l-3 9H2",
    bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0",
    chart: "M3 3v18h18 M7 15v3 M11 10v8 M15 6v12 M19 12v6",
    users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8",
    calendar: "M8 2v4 M16 2v4 M3 8h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6",
    logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
    plus: "M12 5v14 M5 12h14",
    x: "M18 6 6 18 M6 6l12 12",
    alert: "M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
    compass: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z m4.2-14.2-2.1 6.3-6.3 2.1 2.1-6.3z",
    layers: "m12 2 10 6-10 6L2 8z m10 10-10 6-10-6 m20-4-10 6-10-6",
  };

  const Icon = ({ name, size = 18, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      {paths[name] ? <path d={paths[name]} /> : null}
    </svg>
  );

  const Crown = ({ size = 34, color = "var(--gold-500)" }) => (
    <svg width={size} height={size * 0.72} viewBox="0 0 100 72" fill="none" aria-label="Citizens crown">
      <path d="M8 58 4 22l22 14L50 8l24 28 22-14-4 36z" stroke={color} strokeWidth="5"
        strokeLinejoin="round" fill="none" />
      <path d="M10 66h80" stroke={color} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );

  const Card = ({ children, style, onClick }) => (
    <div onClick={onClick} style={{
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: 18, padding: 20, cursor: onClick ? "pointer" : undefined,
      ...style,
    }}>{children}</div>
  );

  const SectionTitle = ({ children, right }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 2px 12px" }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)" }}>{children}</div>
      {right || null}
    </div>
  );

  const Pill = ({ children, active, onClick, tone }) => (
    <button onClick={onClick} style={{
      border: "1px solid " + (active ? "var(--brand-strong)" : "var(--border)"),
      background: active ? "var(--gold-100)" : "var(--surface-sunk)",
      color: tone || (active ? "var(--gold-800)" : "var(--text-secondary)"),
      borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
    }}>{children}</button>
  );

  const Btn = ({ children, onClick, kind = "ghost", style, disabled }) => {
    const kinds = {
      gold: { background: "var(--brand)", color: "var(--on-brand)", border: "1px solid var(--brand-strong)" },
      ink: { background: "var(--surface-inverse)", color: "var(--text-on-inverse)", border: "1px solid transparent" },
      ghost: { background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border)" },
      danger: { background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid transparent" },
    };
    return (
      <button onClick={onClick} disabled={disabled} style={{
        ...kinds[kind], borderRadius: 12, padding: "9px 16px", fontSize: 14, fontWeight: 700,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1,
        display: "inline-flex", alignItems: "center", gap: 8, ...style,
      }}>{children}</button>
    );
  };

  // SVG donut — pct 0..100
  const Ring = ({ pct, r = 44, stroke = 9, color = "var(--brand)", label, sub }) => {
    const c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    const s = r * 2 + stroke * 2;
    return (
      <div style={{ position: "relative", width: s, height: s }}>
        <svg width={s} height={s}>
          <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke="var(--surface-sunk)" strokeWidth={stroke} />
          <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
            transform={`rotate(-90 ${s / 2} ${s / 2})`} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: r * 0.5, fontWeight: 800 }}>{label}</div>
          {sub ? <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>{sub}</div> : null}
        </div>
      </div>
    );
  };

  // Sparkline — vals[] scaled into a w×h path (+ soft area fill)
  const Spark = ({ vals, w = 160, h = 44, color = "var(--gold-600)" }) => {
    if (!vals || vals.length < 2) return null;
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const pts = vals.map((v, i) => [
      (i / (vals.length - 1)) * (w - 8) + 4,
      h - 6 - ((v - min) / span) * (h - 12),
    ]);
    const d = "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
    const area = d + ` L${(w - 4).toFixed(1)} ${h - 2} L4 ${h - 2} Z`;
    return (
      <svg width={w} height={h} style={{ display: "block" }}>
        <path d={area} fill={color} opacity="0.12" />
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={color} />
      </svg>
    );
  };

  const Toggle = ({ on, onChange }) => (
    <button onClick={() => onChange(!on)} aria-pressed={on} style={{
      width: 40, height: 22, borderRadius: 999, border: "1px solid var(--border)",
      background: on ? "var(--brand)" : "var(--surface-sunk)", position: "relative",
      cursor: "pointer", transition: "background .18s ease", padding: 0,
    }}>
      <span style={{
        position: "absolute", top: 2, left: on ? 20 : 2, width: 16, height: 16,
        borderRadius: "50%", background: "var(--paper)", border: "1px solid var(--border)",
        transition: "left .18s ease",
      }} />
    </button>
  );

  const tone = (t) => t === "good" ? "var(--success)" : t === "bad" ? "var(--danger)" : t === "warn" ? "var(--warning)" : "var(--info)";

  const sevMeta = (severity) => severity === "critical"
    ? { color: "var(--danger)", bg: "var(--danger-bg)", label: "Urgent" }
    : severity === "warning"
      ? { color: "var(--warning)", bg: "var(--warning-bg)", label: "Needs attention" }
      : severity === "good"
        ? { color: "var(--success)", bg: "var(--success-bg)", label: "Encouraging" }
        : { color: "var(--info)", bg: "var(--surface-sunk)", label: "Observation" };

  window.UI = { Icon, Crown, Card, SectionTitle, Pill, Btn, Ring, Spark, Toggle, tone, sevMeta };
})();
