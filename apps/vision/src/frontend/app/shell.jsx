// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — shell: sidebar (nested nav §3) + topbar
//  ------------------------------------------------------------------
//  The four primary nav groups are law: Home · Spaces · Insights ·
//  Goals (+ Settings). Every node is muteable from Settings →
//  Navigation (navHidden). Desktop-first back-office; the sidebar
//  collapses to icons under 1000px.
// ════════════════════════════════════════════════════════════════════
(() => {
  const { Icon, Crown } = window.UI;

  // The §3 nav tree. `key` doubles as the navHidden key; leaves carry
  // `view` (+ optional `metric` for Analytics children / `filter` for
  // Directory children).
  const NAV_TREE = [
    { key: "home", label: "Home", icon: "home", view: "home" },
    {
      key: "spaces", label: "Spaces", icon: "grid", children: [
        {
          key: "spaces.directory", label: "Directory", view: "spaces", children: [
            { key: "spaces.dir.projects", label: "Community Projects", view: "spaces", filter: "Community Projects" },
            { key: "spaces.dir.volunteers", label: "Volunteers", view: "spaces", filter: "Volunteers" },
            { key: "spaces.dir.outreach", label: "Outreach", view: "spaces", filter: "Outreach" },
            { key: "spaces.dir.fundraising", label: "Fundraising", view: "spaces", filter: "Fundraising" },
            { key: "spaces.dir.events", label: "Events", view: "spaces", filter: "Events" },
          ],
        },
        { key: "spaces.activities", label: "Activities", view: "activities" },
        { key: "spaces.configure", label: "Configure", view: "configureSpaces" },
      ],
    },
    {
      key: "insights", label: "Insights", icon: "eye", children: [
        { key: "insights.timeline", label: "Timeline Map", view: "timeline" },
        { key: "insights.feed", label: "Observation Feed", view: "feed" },
        {
          key: "insights.analytics", label: "Analytics", view: "analytics", children: [
            { key: "insights.an.reach", label: "Reach", view: "analytics", metric: "reach" },
            { key: "insights.an.growth", label: "Growth", view: "analytics", metric: "growth" },
            { key: "insights.an.retention", label: "Retention", view: "analytics", metric: "retention" },
            { key: "insights.an.funnel", label: "Funnel", view: "analytics", metric: "funnel" },
            { key: "insights.an.engagement", label: "Engagement", view: "analytics", metric: "engagement" },
            { key: "insights.an.broadcast", label: "Broadcast", view: "analytics", metric: "broadcast" },
          ],
        },
        { key: "insights.coverage", label: "Coverage", view: "coverage" },
        { key: "insights.advisories", label: "Advisories", view: "advisories" },
        { key: "insights.reports", label: "Reports", view: "reports" },
      ],
    },
    {
      key: "goals", label: "Goals", icon: "target", children: [
        { key: "goals.objectives", label: "Objectives", view: "objectives" },
        { key: "goals.projects", label: "Projects", view: "projects" },
        { key: "goals.vision", label: "Vision Statements", view: "visionStatements" },
      ],
    },
    { key: "settings", label: "Settings", icon: "settings", view: "settings" },
  ];

  const TITLES = {
    home: "Org overview", spaces: "Spaces", activities: "Activities",
    configureSpaces: "Configure spaces", timeline: "Timeline map",
    feed: "Observation feed", analytics: "Analytics", coverage: "Coverage",
    advisories: "Advisories", reports: "Reports & exports",
    objectives: "Objectives", projects: "Projects",
    visionStatements: "Vision statements", settings: "Settings",
  };

  function Shell({ session, view, metric, filter, goView, theme, setTheme, navHidden, setNavHidden, depth, setDepth, onSignOut, children }) {
    const [open, setOpen] = React.useState({ spaces: true, insights: true, goals: true, "spaces.directory": false, "insights.analytics": false });
    const [narrow, setNarrow] = React.useState(typeof window !== "undefined" && window.innerWidth < 1000);
    React.useEffect(() => {
      const onResize = () => setNarrow(window.innerWidth < 1000);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);

    const isActive = (node) =>
      node.view === view &&
      (node.metric === undefined || node.metric === metric) &&
      (node.filter === undefined || node.filter === filter);

    const NavNode = ({ node, depthLevel }) => {
      if (navHidden[node.key]) return null;
      const hasKids = !!(node.children && node.children.length);
      const active = node.view && isActive(node);
      const expanded = open[node.key];
      const clickable = () => {
        if (node.view) goView(node.view, node.metric, node.filter);
        if (hasKids) setOpen({ ...open, [node.key]: !expanded });
      };
      return (
        <div>
          <button onClick={clickable} title={node.label} style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            border: "none", cursor: "pointer", textAlign: "left",
            borderRadius: 10, padding: narrow ? "10px" : "9px 12px",
            paddingLeft: narrow ? 10 : 12 + depthLevel * 16,
            background: active ? "var(--gold-100)" : "transparent",
            color: active ? "var(--gold-800)" : depthLevel ? "var(--text-secondary)" : "var(--text-primary)",
            fontSize: depthLevel ? 13 : 14, fontWeight: depthLevel ? 650 : 750,
            justifyContent: narrow ? "center" : "flex-start",
          }}>
            {node.icon ? <Icon name={node.icon} size={17} /> : null}
            {!narrow ? <span style={{ flex: 1 }}>{node.label}</span> : null}
            {!narrow && hasKids ? (
              <span style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .16s ease", display: "inline-flex" }}>
                <Icon name="chevron" size={14} />
              </span>
            ) : null}
          </button>
          {hasKids && expanded && !narrow ? node.children.map((c) => (
            <NavNode key={c.key} node={c} depthLevel={depthLevel + 1} />
          )) : null}
        </div>
      );
    };

    return (
      <div style={{ display: "flex", height: "100%" }}>
        {/* Sidebar */}
        <aside style={{
          width: narrow ? 64 : 248, flexShrink: 0, display: "flex", flexDirection: "column",
          borderRight: "1px solid var(--border)", background: "var(--surface-card)",
          padding: narrow ? "18px 8px" : "20px 14px", gap: 2, overflowY: "auto",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: narrow ? "0 4px 16px" : "0 10px 18px", justifyContent: narrow ? "center" : "flex-start" }}>
            <Crown size={narrow ? 26 : 30} />
            {!narrow ? (
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em" }}>Citizens Vision</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", color: "var(--brand-ink)" }}>CONNECTING THE KINGDOM</div>
              </div>
            ) : null}
          </div>
          {NAV_TREE.map((node) => <NavNode key={node.key} node={node} depthLevel={0} />)}
          <div style={{ flex: 1 }} />
          <button onClick={onSignOut} style={{
            display: "flex", alignItems: "center", gap: 10, border: "none", cursor: "pointer",
            borderRadius: 10, padding: narrow ? 10 : "9px 12px", background: "transparent",
            color: "var(--text-secondary)", fontSize: 13.5, fontWeight: 700,
            justifyContent: narrow ? "center" : "flex-start",
          }}>
            <Icon name="logout" size={16} />
            {!narrow ? "Sign out" : null}
          </button>
        </aside>

        {/* Main column */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <header style={{
            display: "flex", alignItems: "center", gap: 14, padding: "14px 24px",
            borderBottom: "1px solid var(--border)", background: "var(--surface-card)",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{TITLES[view] || "Citizens Vision"}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>{window.CV_DATA.org.name}</div>
            </div>
            {/* Basic / In-depth depth toggle */}
            <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              {["basic", "indepth"].map((d) => (
                <button key={d} onClick={() => setDepth(d)} style={{
                  border: "none", padding: "7px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                  background: depth === d ? "var(--gold-100)" : "transparent",
                  color: depth === d ? "var(--gold-800)" : "var(--text-secondary)",
                }}>{d === "basic" ? "Basic" : "In-depth"}</button>
              ))}
            </div>
            <button onClick={() => setTheme(theme === "noir" ? "light" : "noir")} title="Toggle Light / Noir" style={{
              border: "1px solid var(--border)", background: "var(--surface-sunk)", color: "var(--text-primary)",
              borderRadius: 10, padding: 8, cursor: "pointer", display: "inline-flex",
            }}><Icon name="eye" size={16} /></button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {session.avatarUrl ? (
                <img src={session.avatarUrl} alt="" style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid var(--ring)" }} />
              ) : (
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", background: "var(--gold-100)", color: "var(--gold-800)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13,
                }}>{(session.name || "?")[0]}</div>
              )}
              {!narrow ? <span style={{ fontSize: 13, fontWeight: 700 }}>{session.name}</span> : null}
            </div>
          </header>
          <main style={{ flex: 1, overflowY: "auto", padding: 24 }}>
            {children}
          </main>
        </div>
      </div>
    );
  }

  window.Screens = Object.assign(window.Screens || {}, { Shell });
  window.CV_NAV_TREE = NAV_TREE;
})();
