// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — surfaces beyond Home (window.Screens.*)
//  ------------------------------------------------------------------
//  Nav architecture per VISION_BUILD_PLAN §3. Analytical surfaces follow
//  the five-layer law; Goals-group collections are user-editable (§6) —
//  shapes stay aligned to the wiring-spec DB columns so live wiring is a
//  swap, not a rewrite. Each surface notes its backend source
//  (VISION_BACKEND_WIRING_SPEC §) in a comment.
// ════════════════════════════════════════════════════════════════════
(() => {
  const { Card, SectionTitle, Pill, Btn, Ring, Spark, Icon, sevMeta } = window.UI;
  const D = window.CV_DATA;
  const ObservationCard = window.Screens.ObservationCard;

  // ── Spaces · Directory (§3.5 vision.spaces) ────────────────────────
  function Spaces({ goView, filter }) {
    const list = filter ? D.spaces.filter((s) => s.name === filter) : D.spaces;
    return (
      <div className="fade-in">
        <SectionTitle right={
          <Btn kind="ghost" onClick={() => goView("configureSpaces")} style={{ padding: "7px 12px", fontSize: 13 }}>
            <Icon name="settings" size={14} /> Configure spaces
          </Btn>
        }>{filter ? "Spaces · " + filter : "Spaces directory"}</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {list.map((s) => (
            <Card key={s.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: s.color }}><Icon name={s.icon} size={20} /></span>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{s.name}</div>
              </div>
              <div style={{ display: "flex", gap: 16, margin: "14px 0 10px", fontSize: 13, color: "var(--text-secondary)" }}>
                <span><b style={{ color: "var(--text-primary)" }}>{s.activities}</b> activities</span>
                <span><b style={{ color: "var(--text-primary)" }}>{s.people}</b> people</span>
                <span><b style={{ color: "var(--text-primary)" }}>{s.reach}</b> reach</span>
              </div>
              <Spark vals={s.trend} w={200} h={36} color={s.color} />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Spaces · Configure (§3.5 vision.spaces CRUD + category_space_map)
  function ConfigureSpaces() {
    const [spaces, setSpaces] = React.useState(D.spaces.map((s) => ({ ...s })));
    const [name, setName] = React.useState("");
    const add = () => {
      if (!name.trim()) return;
      setSpaces([...spaces, { id: "sp-" + Date.now(), name: name.trim(), icon: "grid", color: "var(--gold-600)", activities: 0, people: 0, reach: 0, trend: [0, 0] }]);
      setName("");
    };
    return (
      <div className="fade-in">
        <SectionTitle>Configure spaces</SectionTitle>
        <Card>
          {spaces.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px", borderBottom: "1px solid var(--divider)" }}>
              <span style={{ color: s.color }}><Icon name={s.icon} size={18} /></span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{s.name}</span>
              <button onClick={() => setSpaces(spaces.filter((x) => x.id !== s.id))} style={{
                border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer",
              }}><Icon name="x" size={16} /></button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New space name"
              style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: "9px 14px", fontSize: 14, background: "var(--surface-sunk)", color: "var(--text-primary)" }} />
            <Btn kind="gold" onClick={add}><Icon name="plus" size={15} /> Add space</Btn>
          </div>
          <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--text-tertiary)" }}>
            Category → space mapping arrives with the live wiring (vision.category_space_map).
          </div>
        </Card>
      </div>
    );
  }

  // ── Spaces · Activities (§3.2 vision.activities + cc_event_claims) ─
  function Activities() {
    return (
      <div className="fade-in">
        <SectionTitle>Activity log</SectionTitle>
        <Card style={{ padding: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
                {["Activity", "Space", "Date", "Reach", "Engagement", "Rating", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", fontWeight: 700, borderBottom: "1px solid var(--divider)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {D.activities.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--divider)" }}>
                  <td style={{ padding: "11px 12px", fontWeight: 700 }}>{a.title}</td>
                  <td style={{ padding: "11px 12px", color: "var(--text-secondary)" }}>{a.space}</td>
                  <td style={{ padding: "11px 12px", color: "var(--text-secondary)" }}>{a.date}</td>
                  <td style={{ padding: "11px 12px" }}>{a.reach}</td>
                  <td style={{ padding: "11px 12px" }}>{a.engagement}</td>
                  <td style={{ padding: "11px 12px" }}>{a.rating}★</td>
                  <td style={{ padding: "11px 12px" }}>
                    {a.claimed ? (
                      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--gold-800)", background: "var(--gold-100)", borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>
                        Claimed from Connect
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  // ── Insights · Timeline Map (flagship; MapLibre lands with live data)
  function TimelineMap() {
    return (
      <div className="fade-in">
        <SectionTitle>Timeline map</SectionTitle>
        <Card style={{ minHeight: 320, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <span style={{ color: "var(--brand-ink)" }}><Icon name="map" size={40} /></span>
          <div style={{ marginTop: 14, fontWeight: 800, fontSize: 16 }}>The living map of your Kingdom activity</div>
          <div style={{ marginTop: 8, maxWidth: 460, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Single-event reach rings, period playback and stacked range comparison
            arrive here with the live activity data (MapLibre + MapTiler —
            set NEXT_PUBLIC_MAPTILER_KEY). The canvas prototype in the design
            handoff carries the full interaction spec.
          </div>
        </Card>
      </div>
    );
  }

  // ── Insights · Observation Feed (§3.7 advisory_outputs pattern) ────
  function Feed() {
    return (
      <div className="fade-in">
        <SectionTitle>Observation feed</SectionTitle>
        {D.observations.map((obs) => <ObservationCard key={obs.id} obs={obs} />)}
      </div>
    );
  }

  // ── Insights · Analytics (§3.4 RGRE + Funnel + Broadcast) ──────────
  function Analytics({ metric, goView }) {
    const m = metric || "reach";
    const a = D.analytics[m];
    const t = D.narrativeTemplates[a.type];
    const metrics = ["reach", "growth", "retention", "funnel", "engagement", "broadcast"];
    return (
      <div className="fade-in">
        <SectionTitle>Analytics</SectionTitle>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {metrics.map((key) => (
            <Pill key={key} active={m === key} onClick={() => goView("analytics", key)}>
              {key[0].toUpperCase() + key.slice(1)}
            </Pill>
          ))}
        </div>
        <Card>
          {/* Layer 1 — conclusion */}
          <div style={{ fontSize: 18, fontWeight: 800 }}>{D.fill(t.title, a.data)}</div>
          <div style={{ marginTop: 6, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{D.fill(t.body, a.data)}</div>
          {/* Layer 3 — evidence: pct AND count, always */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "18px 0" }}>
            {a.evidence.map(([label, value]) => (
              <div key={label} style={{ background: "var(--surface-sunk)", borderRadius: 12, padding: "10px 16px" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)" }}>{label}</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>
          {/* Layer 4 — chart support */}
          {m === "funnel" ? (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              {a.series.map((v, i) => {
                const max = a.series[0] || 1;
                return (
                  <div key={i} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{
                      height: Math.max(8, (v / max) * 120), background: "var(--brand)",
                      opacity: 1 - i * 0.13, borderRadius: "8px 8px 4px 4px",
                    }} />
                    <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 6, color: "var(--text-secondary)" }}>{a.stages[i]}</div>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{v}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Spark vals={a.series} w={520} h={90} />
          )}
          <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-tertiary)" }}>Source (live wiring): {t.source}</div>
        </Card>
      </div>
    );
  }

  // ── Insights · Coverage (§3.6 mv_boundary_activity_coverage) ───────
  function Coverage() {
    const levelMeta = {
      "well-covered": { color: "var(--success)", bg: "var(--success-bg)" },
      moderate: { color: "var(--info)", bg: "var(--surface-sunk)" },
      low: { color: "var(--warning)", bg: "var(--warning-bg)" },
      gap: { color: "var(--danger)", bg: "var(--danger-bg)" },
    };
    return (
      <div className="fade-in">
        <SectionTitle>Geographic coverage</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
          {D.coverage.map((c) => {
            const meta = levelMeta[c.level];
            return (
              <Card key={c.boundary}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{c.boundary}</div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: meta.color, background: meta.bg, borderRadius: 999, padding: "3px 10px" }}>{c.level}</span>
                </div>
                <div style={{ margin: "12px 0 6px", fontSize: 13, color: "var(--text-secondary)" }}>
                  <b style={{ color: "var(--text-primary)" }}>{c.activities}</b> activities · {c.pct}% of org activity
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "var(--surface-sunk)", overflow: "hidden" }}>
                  <div style={{ width: c.pct + "%", height: "100%", background: meta.color, borderRadius: 999 }} />
                </div>
                {c.level === "gap" ? (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--danger)", fontWeight: 700 }}>
                    No presence yet — a place to be sent.
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Insights · Advisories (§3.7 advisory_outputs + rules) ──────────
  function Advisories() {
    const [dismissed, setDismissed] = React.useState({});
    const live = D.advisories.filter((a) => !dismissed[a.id]);
    return (
      <div className="fade-in">
        <SectionTitle>Advisories</SectionTitle>
        {live.map((adv) => (
          <ObservationCard key={adv.id} obs={adv} onDismiss={(id) => setDismissed({ ...dismissed, [id]: true })} />
        ))}
        {!live.length ? (
          <Card style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
            All advisories handled. Dismissed items return when their rule re-fires.
          </Card>
        ) : null}
      </div>
    );
  }

  // ── Insights · Reports (§3.9 export_logs / scheduled_reports) ──────
  function Reports() {
    const reports = [
      { name: "Monthly impact summary", desc: "Reach, engagement and goal progress for the board.", icon: "file" },
      { name: "Volunteer health", desc: "Retention, churn hotspots and dormancy early-warnings.", icon: "users" },
      { name: "Partnership pack", desc: "Shared metrics for active partner organisations.", icon: "layers" },
    ];
    return (
      <div className="fade-in">
        <SectionTitle>Reports &amp; exports</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {reports.map((r) => (
            <Card key={r.name}>
              <span style={{ color: "var(--brand-ink)" }}><Icon name={r.icon} size={22} /></span>
              <div style={{ fontWeight: 800, fontSize: 15, marginTop: 10 }}>{r.name}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 14px", lineHeight: 1.55 }}>{r.desc}</div>
              <Btn kind="ghost" style={{ fontSize: 13 }}>Export (live wiring: /api/export)</Btn>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Goals · Objectives (§3.3b vision.goals — editable, §6) ─────────
  function Objectives() {
    const [goals, setGoals] = React.useState(D.goalsList.map((g) => ({ ...g })));
    const [name, setName] = React.useState("");
    const add = () => {
      if (!name.trim()) return;
      setGoals([...goals, { id: "g-" + Date.now(), name: name.trim(), target: 100, current: 0, weight: 10, space: "—" }]);
      setName("");
    };
    return (
      <div className="fade-in">
        <SectionTitle>Objectives</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {goals.map((g) => {
            const pct = Math.min(100, Math.round((g.current / (g.target || 1)) * 100));
            return (
              <Card key={g.id}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <Ring pct={pct} r={30} stroke={7} label={pct + "%"} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5 }}>{g.name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
                      {g.current} / {g.target} · weight {g.weight}% · {g.space}
                    </div>
                  </div>
                  <button onClick={() => setGoals(goals.filter((x) => x.id !== g.id))} style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
                    <Icon name="x" size={15} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16, maxWidth: 520 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New objective"
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: "9px 14px", fontSize: 14, background: "var(--surface-card)", color: "var(--text-primary)" }} />
          <Btn kind="gold" onClick={add}><Icon name="plus" size={15} /> Add</Btn>
        </div>
      </div>
    );
  }

  // ── Goals · Projects (§3.3a vision.projects + milestones — editable)
  function Projects() {
    const [projects, setProjects] = React.useState(D.projectsList.map((p) => ({ ...p })));
    const [name, setName] = React.useState("");
    const add = () => {
      if (!name.trim()) return;
      setProjects([...projects, { id: "p-" + Date.now(), name: name.trim(), status: "planning", milestones: [], done: 0, linkedGoal: "—" }]);
      setName("");
    };
    return (
      <div className="fade-in">
        <SectionTitle>Projects</SectionTitle>
        {projects.map((p) => (
          <Card key={p.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>{p.name}</div>
              <span style={{
                fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 10px",
                color: p.status === "active" ? "var(--success)" : "var(--info)",
                background: p.status === "active" ? "var(--success-bg)" : "var(--surface-sunk)",
              }}>{p.status}</span>
              <button onClick={() => setProjects(projects.filter((x) => x.id !== p.id))} style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
                <Icon name="x" size={15} />
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>
              {p.milestones.length ? p.milestones.map((mi, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 14 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: i < p.done ? "var(--success)" : "var(--n-300)",
                  }} />{mi}
                </span>
              )) : <span style={{ color: "var(--text-tertiary)" }}>No milestones yet.</span>}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>Linked goal: {p.linkedGoal}</div>
          </Card>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 4, maxWidth: 520 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New project"
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: "9px 14px", fontSize: 14, background: "var(--surface-card)", color: "var(--text-primary)" }} />
          <Btn kind="gold" onClick={add}><Icon name="plus" size={15} /> Add</Btn>
        </div>
      </div>
    );
  }

  // ── Goals · Vision Statements (§3.3c vision.vision_statements) ─────
  function VisionStatements() {
    const [items, setItems] = React.useState(D.visionList.map((v) => ({ ...v })));
    const [text, setText] = React.useState("");
    const add = () => {
      if (!text.trim()) return;
      setItems([...items, { id: "v-" + Date.now(), text: text.trim(), linkedGoals: 0 }]);
      setText("");
    };
    return (
      <div className="fade-in">
        <SectionTitle>Vision statements</SectionTitle>
        {items.map((v) => (
          <Card key={v.id} style={{ marginBottom: 12, display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{ color: "var(--brand-ink)", marginTop: 2 }}><Icon name="compass" size={20} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.5 }}>“{v.text}”</div>
              <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-secondary)" }}>{v.linkedGoals} linked goal{v.linkedGoals === 1 ? "" : "s"}</div>
            </div>
            <button onClick={() => setItems(items.filter((x) => x.id !== v.id))} style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
              <Icon name="x" size={15} />
            </button>
          </Card>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 4, maxWidth: 640 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Where is God taking this organisation?"
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: "9px 14px", fontSize: 14, background: "var(--surface-card)", color: "var(--text-primary)" }} />
          <Btn kind="gold" onClick={add}><Icon name="plus" size={15} /> Add</Btn>
        </div>
      </div>
    );
  }

  // ── Settings (§5 — single page, multiple panels) ───────────────────
  function Settings({ theme, setTheme, navHidden, setNavHidden, navTree }) {
    const [orgType, setOrgType] = React.useState(D.org.type);
    const [prios, setPrios] = React.useState(D.priorities.slice(0, 3));
    const togglePrio = (p) => setPrios(prios.includes(p)
      ? prios.filter((x) => x !== p)
      : prios.length < 5 ? [...prios, p] : prios);
    const roleTone = { org_admin: "var(--admin)", org_manager: "var(--info)", org_member: "var(--success)", org_viewer: "var(--n-500)" };

    const NavRow = ({ node, depth }) => (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", paddingLeft: depth * 20, borderBottom: "1px solid var(--divider)" }}>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: depth ? 600 : 800 }}>{node.label}</span>
        {node.view === "home" ? (
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>always on</span>
        ) : (
          <window.UI.Toggle on={!navHidden[node.key]} onChange={(on) => setNavHidden({ ...navHidden, [node.key]: !on })} />
        )}
      </div>
    );
    const flat = [];
    const walk = (nodes, depth) => nodes.forEach((n) => { flat.push([n, depth]); if (n.children) walk(n.children, depth + 1); });
    walk(navTree, 0);

    return (
      <div className="fade-in" style={{ display: "grid", gap: 16, maxWidth: 860 }}>
        <Card>
          <SectionTitle>Organisation type</SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {D.orgTypes.map((t) => <Pill key={t} active={orgType === t} onClick={() => setOrgType(t)}>{t}</Pill>)}
          </div>
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-tertiary)" }}>Tailors labels, metrics and advisory copy. Vision serves every org type.</div>
        </Card>

        <Card>
          <SectionTitle>Success definition · priorities (max 5)</SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {D.priorities.map((p) => <Pill key={p} active={prios.includes(p)} onClick={() => togglePrio(p)}>{p}</Pill>)}
          </div>
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-tertiary)" }}>Your priorities shape the health model weights and recommendations.</div>
        </Card>

        <Card>
          <SectionTitle>Navigation</SectionTitle>
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 8 }}>Mute any tab or nested tab; hiding a group hides its children. Home stays on.</div>
          {flat.map(([n, d]) => <NavRow key={n.key} node={n} depth={d} />)}
        </Card>

        <Card>
          <SectionTitle>Team</SectionTitle>
          {D.team.map((m) => (
            <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--divider)" }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: "var(--surface-sunk)",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13,
              }}>{m.name[0]}</div>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{m.name}</span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{m.dept}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: roleTone[m.role] || "var(--text-secondary)" }}>{m.role}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-tertiary)" }}>Invites &amp; role changes are org_admin-gated (vision.user_org_roles — spec §3.11).</div>
        </Card>

        <Card>
          <SectionTitle>Partnerships</SectionTitle>
          {D.partnerships.map((p) => (
            <div key={p.org} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--divider)" }}>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{p.org}</span>
              <span style={{
                fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 10px",
                color: p.status === "active" ? "var(--success)" : "var(--warning)",
                background: p.status === "active" ? "var(--success-bg)" : "var(--warning-bg)",
              }}>{p.status}</span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>sharing: {p.sharing}</span>
              {p.metrics.map((mm) => (
                <span key={mm} style={{ fontSize: 11, fontWeight: 700, background: "var(--surface-sunk)", borderRadius: 999, padding: "3px 9px", color: "var(--text-secondary)" }}>{mm}</span>
              ))}
            </div>
          ))}
        </Card>

        <Card>
          <SectionTitle>Appearance</SectionTitle>
          <div style={{ display: "flex", gap: 8 }}>
            <Pill active={theme === "light"} onClick={() => setTheme("light")}>Light</Pill>
            <Pill active={theme === "noir"} onClick={() => setTheme("noir")}>Noir</Pill>
          </div>
        </Card>
      </div>
    );
  }

  window.Screens = Object.assign(window.Screens || {}, {
    Spaces, ConfigureSpaces, Activities, TimelineMap, Feed, Analytics,
    Coverage, Advisories, Reports, Objectives, Projects, VisionStatements, Settings,
  });
})();
