// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — Home / Org Overview (window.Screens.Home)
//  ------------------------------------------------------------------
//  The five-layer law (build plan §0): every analytical surface reveals
//  Conclusions → Contributions → Evidence → Charts → Raw Data, never
//  out of order. The Observation cards implement it via a tab strip.
//  Copy comes from the narrative engine — fill(template, data) — so
//  backend calc rows drop straight in later (§4 contract).
// ════════════════════════════════════════════════════════════════════
(() => {
  const { Card, SectionTitle, Ring, Spark, tone, sevMeta, Icon } = window.UI;
  const D = window.CV_DATA;

  // One observation/advisory card, five layers. Used by Home, the
  // Observation Feed and Advisories (same pattern, per the build plan).
  function ObservationCard({ obs, onDismiss }) {
    const [open, setOpen] = React.useState(false);
    const [tab, setTab] = React.useState("contributions");
    const t = D.narrativeTemplates[obs.type];
    const meta = sevMeta(obs.severity);
    const title = D.fill(t.title, obs.data);
    const body = D.fill(t.body, obs.data);

    const tabs = [
      ["contributions", "Contributions"],
      ["evidence", "Evidence"],
      ["charts", "Charts"],
      ["raw", "Raw Data"],
    ];

    return (
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{
            marginTop: 2, fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
            color: meta.color, background: meta.bg, borderRadius: 999, padding: "4px 10px",
            whiteSpace: "nowrap",
          }}>{meta.label}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Layer 1 — Conclusion, plain language, first. */}
            <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
            <div style={{ marginTop: 4, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.55 }}>{body}</div>
          </div>
          <button onClick={() => setOpen(!open)} style={{
            border: "1px solid var(--border)", background: "var(--surface-sunk)",
            borderRadius: 10, padding: 6, cursor: "pointer", color: "var(--text-secondary)",
            transform: open ? "rotate(180deg)" : "none", transition: "transform .18s ease",
          }}><Icon name="chevron" size={16} /></button>
        </div>

        {open ? (
          <div className="fade-in" style={{ marginTop: 16, borderTop: "1px solid var(--divider)", paddingTop: 12 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {tabs.map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} style={{
                  border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700,
                  cursor: "pointer",
                  background: tab === key ? "var(--gold-100)" : "transparent",
                  color: tab === key ? "var(--gold-800)" : "var(--text-secondary)",
                }}>{label}</button>
              ))}
            </div>

            {tab === "contributions" ? (
              <div>
                {(obs.contributions || []).map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "7px 2px", fontSize: 13.5 }}>
                    <span style={{ color: "var(--brand-ink)", fontWeight: 800 }}>•</span>
                    <span><b>{c.label}</b> — <span style={{ color: "var(--text-secondary)" }}>{c.detail}</span></span>
                  </div>
                ))}
                {!(obs.contributions || []).length ? (
                  <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Contribution attribution lands with the backend calc functions.</div>
                ) : null}
              </div>
            ) : null}

            {tab === "evidence" ? (
              <div style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.7 }}>
                {Object.entries(obs.data).map(([k, v]) => (
                  <span key={k} style={{
                    display: "inline-block", margin: "0 8px 8px 0", padding: "4px 10px",
                    background: "var(--surface-sunk)", borderRadius: 8,
                  }}><b style={{ color: "var(--text-primary)" }}>{String(v)}</b> <span style={{ fontSize: 11.5 }}>{k}</span></span>
                ))}
              </div>
            ) : null}

            {tab === "charts" ? (
              obs.chart ? <Spark vals={obs.chart} w={320} h={64} /> :
                <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No trend series for this insight.</div>
            ) : null}

            {tab === "raw" ? (
              <table style={{ fontSize: 13, borderCollapse: "collapse", width: "100%" }}>
                <tbody>
                  {Object.entries(obs.data).map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: "1px solid var(--divider)" }}>
                      <td style={{ padding: "6px 10px 6px 0", color: "var(--text-secondary)", fontFamily: "ui-monospace, monospace" }}>{k}</td>
                      <td style={{ padding: "6px 0", fontWeight: 700 }}>{String(v)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: "6px 10px 6px 0", color: "var(--text-tertiary)", fontFamily: "ui-monospace, monospace" }}>source</td>
                    <td style={{ padding: "6px 0", color: "var(--text-tertiary)" }}>{t.source}</td>
                  </tr>
                </tbody>
              </table>
            ) : null}

            {onDismiss ? (
              <div style={{ marginTop: 12, textAlign: "right" }}>
                <button onClick={() => onDismiss(obs.id)} style={{
                  border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)",
                  borderRadius: 10, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                }}>Dismiss</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
    );
  }

  function Home() {
    const org = D.org;
    return (
      <div className="fade-in">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 340px) 1fr", gap: 16, alignItems: "start" }}>
          {/* Health gauge */}
          <Card>
            <SectionTitle>Organisation health</SectionTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <Ring pct={org.health} label={org.health} sub="of 100" color="var(--brand)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  Weighted across your success priorities. Trend over 6 months:
                </div>
                <div style={{ marginTop: 10 }}><Spark vals={org.healthTrend} w={150} h={40} /></div>
              </div>
            </div>
          </Card>

          {/* Kingdom Pulse */}
          <Card>
            <SectionTitle>Kingdom pulse</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              {D.pulse.map((p) => (
                <div key={p.label} style={{ background: "var(--surface-sunk)", borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{p.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 24, fontWeight: 800 }}>{p.value}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: tone(p.tone) }}>{p.delta}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <SectionTitle>Observation feed</SectionTitle>
          {D.observations.map((obs) => <ObservationCard key={obs.id} obs={obs} />)}
        </div>
      </div>
    );
  }

  window.Screens = window.Screens || {};
  window.Screens.Home = Home;
  window.Screens.ObservationCard = ObservationCard;
})();
