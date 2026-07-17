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

  // ── Live-collection helpers (increment 4, spec §3.2/§3.3) ──────────
  // The editable-collection screens below (Objectives / Projects / Vision
  // statements / Activities) follow the ConfigureSpaces template EXACTLY:
  // demo stays local-only; in live mode they load real rows from their
  // RLS-gated /api/* handler and do optimistic writes with revert. These
  // mappers turn a DB row into the demo card shape (data.jsx is the
  // contract) so the wiring is a swap, not a rewrite. Missing live sources
  // (e.g. numeric goal progress) degrade to an honest em dash — never a
  // fabricated number, so the smallest org never reads worse than the demo.
  const liveCtx = () => ({
    isLive: D.mode === "live" && !!D.orgId,
    authFetch: (window.CV_STORE && window.CV_STORE.authFetch) || null,
    // Caller's role + id in the active org (set by live.jsx) — the Team card
    // gates admin-only controls and hides self-mutation with these.
    role: D.orgRole || null,
    me: D.userId || null,
  });
  // goals row (+ optional alignment score) → Objectives card shape.
  const mapGoal = (g, score) => ({
    id: g.id,
    name: g.title,
    target: g.target_value !== null && g.target_value !== undefined ? g.target_value : "—",
    unit: g.target_unit || "",
    weight: g.priority_weight,
    status: g.status,
    // Alignment is Vision's honest "progress" proxy for a live goal (how well
    // real activity aligns to it — compute_alignment_score). null when the
    // goal isn't active / the score didn't load: ring shows an em dash.
    align: score && score.alignment_score !== null && score.alignment_score !== undefined
      ? Math.max(0, Math.min(100, Math.round(Number(score.alignment_score) * 100))) : null,
    linked: score ? Number(score.linked_activities || 0) : null,
    live: true,
  });
  // projects row → Projects card shape (list has no milestones/goal-links).
  const mapProject = (p) => ({
    id: p.id, name: p.name, status: p.status || "planning",
    desc: p.description || "",
    dept: (p.departments && p.departments.name) || "",
    live: true,
  });
  // vision_statements row → Vision statement card shape.
  const mapVision = (v) => ({
    id: v.id, text: v.title, desc: v.description || "", live: true,
  });
  // activities row (+ optional per-activity metrics from mig 153) → Activity
  // table shape. reach/engagement/rating are present only for a CLAIMED activity
  // (one with a cc_event_claim → a metrics row); a manual/unclaimed activity has
  // none, so those cells render an honest em dash (spec §3.2b note). `claimed`
  // is derived from the presence of a metrics row.
  const mapActivity = (a, metric) => ({
    id: a.id,
    title: a.title,
    type: a.type || "other",
    date: a.date,
    reach: metric ? metric.reach : null,
    engagement: metric ? metric.engagement_score : null,
    rating: metric ? metric.avg_rating : null,
    claimed: !!metric,
    live: true,
  });
  // vision.org_members row (mig 154 — user_org_roles joined to display-safe
  // public.profiles identity) → Team card shape. full_name is null-safe: a member
  // without a profile name degrades to a neutral label + initial, never a
  // fabricated identity (spec §3.11 / VISION.md litmus #3). `id` is the ROLE-row
  // id — the role-change PATCH / remove DELETE key on it, not on the person.
  const mapMember = (r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.full_name || "Unnamed member",
    avatar: r.avatar_url || null,
    role: r.role,
    dept: r.department_name || "—",
    title: r.title || "",
    isFounder: !!r.is_founder,
    live: true,
  });

  // ── Spaces · Directory (§3.5 vision.spaces + §3.5b space metrics) ──
  // Cards read D.spaces, which live.jsx overlays from /api/spaces (per-space
  // reach_per_space / engagement_per_space + snapshot trend, mig 151). In live
  // mode with no spaces yet the list is a REAL empty (never fabricated) — the
  // empty state points to Configure spaces rather than sample cards.
  function Spaces({ goView, filter }) {
    const list = filter ? D.spaces.filter((s) => s.name === filter) : D.spaces;
    return (
      <div className="fade-in">
        <SectionTitle right={
          <Btn kind="ghost" onClick={() => goView("configureSpaces")} style={{ padding: "7px 12px", fontSize: 13 }}>
            <Icon name="settings" size={14} /> Configure spaces
          </Btn>
        }>{filter ? "Spaces · " + filter : "Spaces directory"}</SectionTitle>
        {list.length === 0 ? (
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "var(--gold-600)" }}><Icon name="grid" size={20} /></span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>No spaces yet</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 3 }}>
                  Group your activities into spaces (departments, ministries, programmes) to see reach and people per area.
                </div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <Btn kind="gold" onClick={() => goView("configureSpaces")}><Icon name="plus" size={15} /> Create a space</Btn>
              </div>
            </div>
          </Card>
        ) : (
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
        )}
      </div>
    );
  }

  // ── Spaces · Configure (§3.5a vision.spaces CRUD + category_space_map) ──
  // Live (D.mode === 'live') wires real CRUD to /api/spaces (+ [id]) and the
  // category→space mapping to /api/spaces/mappings (SECDEF set_category_space,
  // mig 151). Demo keeps the local-only behaviour. Writes are optimistic with
  // revert-on-failure so the smallest org configures without a round-trip wait.
  function ConfigureSpaces() {
    const isLive = D.mode === "live" && !!D.orgId;
    const authFetch = (window.CV_STORE && window.CV_STORE.authFetch) || null;
    const [spaces, setSpaces] = React.useState(
      D.spaces.map((s) => ({ id: s.id, name: s.name, icon: s.icon || "grid", color: s.color || "var(--gold-600)", saved: s.name }))
    );
    const [cats, setCats] = React.useState([]);
    const [name, setName] = React.useState("");
    const [err, setErr] = React.useState(null);
    const [busy, setBusy] = React.useState(false);

    // Load the live mapping surface (Connect categories + current assignment).
    React.useEffect(() => {
      if (!isLive || !authFetch) return;
      let cancelled = false;
      authFetch("/api/spaces/mappings?org_id=" + D.orgId)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!cancelled && j && j.data) setCats(j.data); })
        .catch(() => { /* mapping surface optional */ });
      return () => { cancelled = true; };
    }, [isLive]);

    const add = async () => {
      const n = name.trim();
      if (!n) return;
      if (!isLive) {
        setSpaces([...spaces, { id: "sp-" + Date.now(), name: n, icon: "grid", color: "var(--gold-600)", saved: n }]);
        setName(""); return;
      }
      setBusy(true); setErr(null);
      try {
        const res = await authFetch("/api/spaces?org_id=" + D.orgId, {
          method: "POST", body: JSON.stringify({ name: n }),
        });
        if (!res.ok) throw new Error("Could not add space");
        const j = await res.json();
        const s = j.data;
        setSpaces([...spaces, { id: s.id, name: s.name, icon: s.icon || "grid", color: s.colour || "var(--gold-600)", saved: s.name }]);
        setName("");
      } catch (e) { setErr(e.message || "Could not add space"); }
      finally { setBusy(false); }
    };

    const remove = async (id) => {
      const prev = spaces;
      setSpaces(spaces.filter((x) => x.id !== id)); // optimistic
      setCats(cats.map((c) => (c.space_id === id ? { ...c, space_id: null } : c)));
      if (!isLive) return;
      try {
        const res = await authFetch("/api/spaces/" + id, { method: "DELETE" });
        if (!res.ok) throw new Error("Could not delete space");
      } catch (e) { setErr(e.message || "Could not delete space"); setSpaces(prev); }
    };

    const rename = async (id) => {
      const s = spaces.find((x) => x.id === id);
      if (!s) return;
      const n = (s.name || "").trim();
      if (!isLive || !n || n === s.saved) return;
      try {
        const res = await authFetch("/api/spaces/" + id, {
          method: "PUT", body: JSON.stringify({ name: n }),
        });
        if (!res.ok) throw new Error("Could not rename space");
        setSpaces((cur) => cur.map((x) => (x.id === id ? { ...x, saved: n } : x)));
      } catch (e) {
        setErr(e.message || "Could not rename space");
        setSpaces((cur) => cur.map((x) => (x.id === id ? { ...x, name: x.saved } : x)));
      }
    };

    const setMapping = async (categoryId, spaceId) => {
      const prev = cats;
      setCats(cats.map((c) => (c.id === categoryId ? { ...c, space_id: spaceId } : c))); // optimistic
      try {
        const res = await authFetch("/api/spaces/mappings?org_id=" + D.orgId, {
          method: "PUT", body: JSON.stringify({ category_id: categoryId, space_id: spaceId }),
        });
        if (!res.ok) throw new Error("Could not update mapping");
      } catch (e) { setErr(e.message || "Could not update mapping"); setCats(prev); }
    };

    return (
      <div className="fade-in">
        <SectionTitle>Configure spaces</SectionTitle>
        {err ? (
          <div style={{ marginBottom: 12, fontSize: 13, color: "var(--danger)", background: "var(--danger-bg)", borderRadius: 12, padding: "9px 14px" }}>{err}</div>
        ) : null}
        <Card>
          {spaces.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 2px", borderBottom: "1px solid var(--divider)" }}>
              <span style={{ color: s.color }}><Icon name={s.icon} size={18} /></span>
              <input
                value={s.name}
                onChange={(e) => setSpaces(spaces.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
                onBlur={() => rename(s.id)}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                readOnly={!isLive}
                style={{ flex: 1, fontWeight: 700, fontSize: 14, border: "1px solid transparent", background: "transparent", color: "var(--text-primary)", borderRadius: 8, padding: "5px 8px" }}
              />
              <button onClick={() => remove(s.id)} aria-label="Delete space" style={{
                border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer",
              }}><Icon name="x" size={16} /></button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New space name"
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: "9px 14px", fontSize: 14, background: "var(--surface-sunk)", color: "var(--text-primary)" }} />
            <Btn kind="gold" onClick={add} disabled={busy}><Icon name="plus" size={15} /> Add space</Btn>
          </div>
        </Card>

        {isLive ? (
          <div style={{ marginTop: 18 }}>
            <SectionTitle>Category → space mapping</SectionTitle>
            <Card>
              <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 12 }}>
                Assign each Citizens Connect category to a space. Reach and people for a space are drawn from the activities in its mapped categories.
              </div>
              {cats.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No categories available yet.</div>
              ) : cats.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 2px", borderBottom: "1px solid var(--divider)" }}>
                  <span style={{ fontSize: 16 }}>{c.emoji || "•"}</span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{c.name}</span>
                  <select
                    value={c.space_id || ""}
                    onChange={(e) => setMapping(c.id, e.target.value || null)}
                    style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "7px 10px", fontSize: 13, background: "var(--surface-sunk)", color: "var(--text-primary)", minWidth: 160 }}>
                    <option value="">Unmapped</option>
                    {spaces.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </Card>
          </div>
        ) : (
          <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--text-tertiary)" }}>
            Category → space mapping is available once your organisation is linked to Citizens Connect.
          </div>
        )}
      </div>
    );
  }

  // ── Spaces · Activities (§3.2 vision.activities + cc_event_claims) ─
  // Live: GET /api/activities + /api/metrics/activities (mig 153 per-activity
  // reach/engagement/rating, best-effort), merged by id; POST logs an activity,
  // DELETE removes it (optimistic + revert). A CLAIMED activity shows its real
  // Connect metrics; a manual one shows honest em dashes — never fabricated, so
  // a sparse live log never reads worse than the demo. Demo stays local-only.
  const ACTIVITY_TYPES = ["event", "meeting", "outreach", "workshop", "service", "training", "other"];
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  function Activities() {
    const { isLive, authFetch } = liveCtx();
    const [rows, setRows] = React.useState(D.activities.map((a) => ({ ...a })));
    const [title, setTitle] = React.useState("");
    const [type, setType] = React.useState("event");
    const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
    const [err, setErr] = React.useState(null);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
      if (!isLive || !authFetch) return;
      let cancelled = false;
      (async () => {
        try {
          const [ar, mr] = await Promise.all([
            authFetch("/api/activities?org_id=" + D.orgId).then((r) => (r.ok ? r.json() : null)),
            authFetch("/api/metrics/activities?org_id=" + D.orgId).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          ]);
          if (cancelled || !ar || !ar.data) return;
          const metrics = {};
          ((mr && mr.data) || []).forEach((m) => { metrics[m.activity_id] = m; });
          setRows(ar.data.map((a) => mapActivity(a, metrics[a.id])));
        } catch (e) { /* keep demo */ }
      })();
      return () => { cancelled = true; };
    }, [isLive]);

    const add = async () => {
      const t = title.trim();
      if (t.length < 2) { setErr("Give the activity a title (2+ characters)."); return; }
      if (!isLive) {
        setRows([{ id: "act-" + Date.now(), title: t, space: "—", date, reach: null, engagement: null, rating: null, claimed: false, live: false }, ...rows]);
        setTitle(""); setErr(null); return;
      }
      setBusy(true); setErr(null);
      try {
        const res = await authFetch("/api/activities?org_id=" + D.orgId, {
          method: "POST", body: JSON.stringify({ title: t, type, date }),
        });
        if (!res.ok) throw new Error("Could not log activity");
        const j = await res.json();
        setRows((cur) => [mapActivity(j.data, null), ...cur]);
        setTitle("");
      } catch (e) { setErr(e.message || "Could not log activity"); }
      finally { setBusy(false); }
    };

    const remove = async (id) => {
      const prev = rows;
      setRows(rows.filter((x) => x.id !== id)); // optimistic
      if (!isLive) return;
      try {
        const res = await authFetch("/api/activities/" + id, { method: "DELETE" });
        if (!res.ok) throw new Error("Could not delete activity");
      } catch (e) { setErr(e.message || "Could not delete activity"); setRows(prev); }
    };

    const cell = (v) => (v === null || v === undefined ? "—" : v);
    const col2 = isLive ? "Type" : "Space";
    const td = { padding: "11px 12px" };
    return (
      <div className="fade-in">
        <SectionTitle>Activity log</SectionTitle>
        {err ? (
          <div style={{ marginBottom: 12, fontSize: 13, color: "var(--danger)", background: "var(--danger-bg)", borderRadius: 12, padding: "9px 14px" }}>{err}</div>
        ) : null}
        <Card style={{ padding: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
                {["Activity", col2, "Date", "Reach", "Engagement", "Rating", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", fontWeight: 700, borderBottom: "1px solid var(--divider)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: "20px 12px", textAlign: "center", color: "var(--text-secondary)" }}>No activities yet. Log your first activity below.</td></tr>
              ) : rows.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--divider)" }}>
                  <td style={{ ...td, fontWeight: 700 }}>{a.title}</td>
                  <td style={{ ...td, color: "var(--text-secondary)" }}>{isLive ? cap(a.type) : a.space}</td>
                  <td style={{ ...td, color: "var(--text-secondary)" }}>{a.date}</td>
                  <td style={td}>{cell(a.reach)}</td>
                  <td style={td}>{cell(a.engagement)}</td>
                  <td style={td}>{a.rating === null || a.rating === undefined ? "—" : a.rating + "★"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {a.claimed ? (
                      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--gold-800)", background: "var(--gold-100)", borderRadius: 999, padding: "3px 9px", marginRight: 8 }}>
                        Claimed from Connect
                      </span>
                    ) : null}
                    <button onClick={() => remove(a.id)} aria-label="Delete activity" style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", verticalAlign: "middle" }}>
                      <Icon name="x" size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", maxWidth: 760, alignItems: "center" }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Log an activity"
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            style={{ flex: 1, minWidth: 200, border: "1px solid var(--border)", borderRadius: 12, padding: "9px 14px", fontSize: 14, background: "var(--surface-card)", color: "var(--text-primary)" }} />
          <select value={type} onChange={(e) => setType(e.target.value)}
            style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "9px 12px", fontSize: 14, background: "var(--surface-card)", color: "var(--text-primary)" }}>
            {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "9px 12px", fontSize: 14, background: "var(--surface-card)", color: "var(--text-primary)" }} />
          <Btn kind="gold" onClick={add} disabled={busy}><Icon name="plus" size={15} /> Log</Btn>
        </div>
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
    // Same graceful-degradation contract as ObservationCard: neutral
    // observations use the template's neutral sentence; bodyKey selects a
    // slot-complete variant while some calc outputs are still unbuilt.
    const bodyTemplate = (a.bodyKey && t[a.bodyKey]) || t.body;
    const title = a.neutral ? D.fill(t.neutral, a.data) : D.fill(t.title, a.data);
    const body = a.neutral ? null : D.fill(bodyTemplate, a.data);
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>{title}</div>
            {a.demo && D.mode === "live" ? (
              <span title="This metric's backend calculation has not landed yet — sample data shown."
                style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", background: "var(--surface-sunk)", borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" }}>
                sample data
              </span>
            ) : null}
          </div>
          {body ? <div style={{ marginTop: 6, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{body}</div> : null}
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
          ) : a.series && a.series.length >= 2 ? (
            <Spark vals={a.series} w={520} h={90} />
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              Trend charts build as daily snapshots accumulate.
            </div>
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
    // Optimistic dismiss; in live mode also persist through the round-trip
    // (PATCH /api/advisory/[id] {action:"dismiss"} — admin/manager gated,
    // best-effort). Demo mode stays purely local. Dismissed advisories
    // return when their rule re-fires past cooldown (server-side).
    const doDismiss = (id) => {
      setDismissed((prev) => ({ ...prev, [id]: true }));
      if (D.mode === "live" && D.orgId && window.CV_STORE) {
        window.CV_STORE.authFetch("/api/advisory/" + id, {
          method: "PATCH",
          body: JSON.stringify({ org_id: D.orgId, action: "dismiss" }),
        }).catch(() => { /* optimistic UI already applied */ });
      }
    };
    return (
      <div className="fade-in">
        <SectionTitle>Advisories</SectionTitle>
        {live.map((adv) => (
          <ObservationCard key={adv.id} obs={adv} onDismiss={doDismiss} />
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
  // Live: GET /api/goals + /api/metrics/alignment (per-goal alignment = the
  // honest progress proxy); POST/DELETE optimistic + revert. Demo local-only.
  function Objectives() {
    const { isLive, authFetch } = liveCtx();
    const [goals, setGoals] = React.useState(D.goalsList.map((g) => ({ ...g })));
    const [name, setName] = React.useState("");
    const [err, setErr] = React.useState(null);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
      if (!isLive || !authFetch) return;
      let cancelled = false;
      (async () => {
        try {
          const [gr, ar] = await Promise.all([
            authFetch("/api/goals?org_id=" + D.orgId).then((r) => (r.ok ? r.json() : null)),
            authFetch("/api/metrics/alignment?org_id=" + D.orgId).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          ]);
          if (cancelled || !gr || !gr.data) return;
          const scores = {};
          ((ar && ar.goal_scores) || []).forEach((s) => { scores[s.goal_id] = s; });
          setGoals(gr.data.map((g) => mapGoal(g, scores[g.id])));
        } catch (e) { /* keep demo */ }
      })();
      return () => { cancelled = true; };
    }, [isLive]);

    const add = async () => {
      const n = name.trim();
      if (!n) return;
      if (!isLive) {
        setGoals([...goals, { id: "g-" + Date.now(), name: n, target: 100, current: 0, weight: 10, space: "—" }]);
        setName(""); return;
      }
      setBusy(true); setErr(null);
      try {
        const res = await authFetch("/api/goals?org_id=" + D.orgId, {
          method: "POST", body: JSON.stringify({ title: n, priority_weight: 1, status: "active" }),
        });
        if (!res.ok) throw new Error("Could not add objective");
        const j = await res.json();
        setGoals((cur) => [...cur, mapGoal(j.data, null)]);
        setName("");
      } catch (e) { setErr(e.message || "Could not add objective"); }
      finally { setBusy(false); }
    };

    const remove = async (id) => {
      const prev = goals;
      setGoals(goals.filter((x) => x.id !== id)); // optimistic
      if (!isLive) return;
      try {
        const res = await authFetch("/api/goals/" + id, { method: "DELETE" });
        if (!res.ok) throw new Error("Could not delete objective");
      } catch (e) { setErr(e.message || "Could not delete objective"); setGoals(prev); }
    };

    return (
      <div className="fade-in">
        <SectionTitle>Objectives</SectionTitle>
        {err ? (
          <div style={{ marginBottom: 12, fontSize: 13, color: "var(--danger)", background: "var(--danger-bg)", borderRadius: 12, padding: "9px 14px" }}>{err}</div>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {goals.map((g) => {
            const pct = g.live
              ? (g.align === null || g.align === undefined ? 0 : g.align)
              : Math.min(100, Math.round((g.current / (g.target || 1)) * 100));
            const ringLabel = g.live && (g.align === null || g.align === undefined) ? "—" : pct + "%";
            return (
              <Card key={g.id}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <Ring pct={pct} r={30} stroke={7} label={ringLabel} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5 }}>{g.name}</div>
                    {g.live ? (
                      <>
                        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
                          target {g.target}{g.unit ? " " + g.unit : ""} · weight {g.weight} · {g.status}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 3 }}>
                          {g.linked === null ? "alignment pending" : g.linked + " linked activit" + (g.linked === 1 ? "y" : "ies") + " · alignment"}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
                        {g.current} / {g.target} · weight {g.weight}% · {g.space}
                      </div>
                    )}
                  </div>
                  <button onClick={() => remove(g.id)} aria-label="Delete objective" style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
                    <Icon name="x" size={15} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16, maxWidth: 520 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New objective"
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: "9px 14px", fontSize: 14, background: "var(--surface-card)", color: "var(--text-primary)" }} />
          <Btn kind="gold" onClick={add} disabled={busy}><Icon name="plus" size={15} /> Add</Btn>
        </div>
      </div>
    );
  }

  // ── Goals · Projects (§3.3a vision.projects + milestones — editable)
  // Live: GET/POST/DELETE /api/projects, optimistic + revert. The list
  // endpoint carries no milestones/goal-links (those live in the detail
  // route), so a live card shows status + description + department rather
  // than fabricating milestone dots. Demo keeps the local milestone view.
  function Projects() {
    const { isLive, authFetch } = liveCtx();
    const [projects, setProjects] = React.useState(D.projectsList.map((p) => ({ ...p })));
    const [name, setName] = React.useState("");
    const [err, setErr] = React.useState(null);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
      if (!isLive || !authFetch) return;
      let cancelled = false;
      authFetch("/api/projects?org_id=" + D.orgId)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!cancelled && j && j.data) setProjects(j.data.map(mapProject)); })
        .catch(() => { /* keep demo */ });
      return () => { cancelled = true; };
    }, [isLive]);

    const add = async () => {
      const n = name.trim();
      if (!n) return;
      if (!isLive) {
        setProjects([...projects, { id: "p-" + Date.now(), name: n, status: "planning", milestones: [], done: 0, linkedGoal: "—" }]);
        setName(""); return;
      }
      setBusy(true); setErr(null);
      try {
        const res = await authFetch("/api/projects?org_id=" + D.orgId, {
          method: "POST", body: JSON.stringify({ name: n, status: "planning" }),
        });
        if (!res.ok) throw new Error("Could not add project");
        const j = await res.json();
        setProjects((cur) => [...cur, mapProject(j.data)]);
        setName("");
      } catch (e) { setErr(e.message || "Could not add project"); }
      finally { setBusy(false); }
    };

    const remove = async (id) => {
      const prev = projects;
      setProjects(projects.filter((x) => x.id !== id)); // optimistic
      if (!isLive) return;
      try {
        const res = await authFetch("/api/projects/" + id, { method: "DELETE" });
        if (!res.ok) throw new Error("Could not delete project");
      } catch (e) { setErr(e.message || "Could not delete project"); setProjects(prev); }
    };

    return (
      <div className="fade-in">
        <SectionTitle>Projects</SectionTitle>
        {err ? (
          <div style={{ marginBottom: 12, fontSize: 13, color: "var(--danger)", background: "var(--danger-bg)", borderRadius: 12, padding: "9px 14px" }}>{err}</div>
        ) : null}
        {projects.map((p) => (
          <Card key={p.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>{p.name}</div>
              <span style={{
                fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 10px",
                color: p.status === "active" ? "var(--success)" : "var(--info)",
                background: p.status === "active" ? "var(--success-bg)" : "var(--surface-sunk)",
              }}>{p.status}</span>
              <button onClick={() => remove(p.id)} aria-label="Delete project" style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
                <Icon name="x" size={15} />
              </button>
            </div>
            {p.live ? (
              <>
                <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  {p.desc ? p.desc : <span style={{ color: "var(--text-tertiary)" }}>No description yet.</span>}
                </div>
                {p.dept ? <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>Department: {p.dept}</div> : null}
              </>
            ) : (
              <>
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
              </>
            )}
          </Card>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 4, maxWidth: 520 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New project"
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: "9px 14px", fontSize: 14, background: "var(--surface-card)", color: "var(--text-primary)" }} />
          <Btn kind="gold" onClick={add} disabled={busy}><Icon name="plus" size={15} /> Add</Btn>
        </div>
      </div>
    );
  }

  // ── Goals · Vision Statements (§3.3c vision.vision_statements) ─────
  // Live: GET/POST/DELETE /api/vision, optimistic + revert. The statement
  // text maps to the row's `title`; the list has no linked-goal count, so a
  // live card shows the optional description instead of a fabricated count.
  function VisionStatements() {
    const { isLive, authFetch } = liveCtx();
    const [items, setItems] = React.useState(D.visionList.map((v) => ({ ...v })));
    const [text, setText] = React.useState("");
    const [err, setErr] = React.useState(null);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
      if (!isLive || !authFetch) return;
      let cancelled = false;
      authFetch("/api/vision?org_id=" + D.orgId)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!cancelled && j && j.data) setItems(j.data.map(mapVision)); })
        .catch(() => { /* keep demo */ });
      return () => { cancelled = true; };
    }, [isLive]);

    const add = async () => {
      const t = text.trim();
      if (!t) return;
      if (!isLive) {
        setItems([...items, { id: "v-" + Date.now(), text: t, linkedGoals: 0 }]);
        setText(""); return;
      }
      setBusy(true); setErr(null);
      try {
        const res = await authFetch("/api/vision?org_id=" + D.orgId, {
          method: "POST", body: JSON.stringify({ title: t, active: true }),
        });
        if (!res.ok) throw new Error("Could not add vision statement");
        const j = await res.json();
        setItems((cur) => [...cur, mapVision(j.data)]);
        setText("");
      } catch (e) { setErr(e.message || "Could not add vision statement"); }
      finally { setBusy(false); }
    };

    const remove = async (id) => {
      const prev = items;
      setItems(items.filter((x) => x.id !== id)); // optimistic
      if (!isLive) return;
      try {
        const res = await authFetch("/api/vision/" + id, { method: "DELETE" });
        if (!res.ok) throw new Error("Could not delete vision statement");
      } catch (e) { setErr(e.message || "Could not delete vision statement"); setItems(prev); }
    };

    return (
      <div className="fade-in">
        <SectionTitle>Vision statements</SectionTitle>
        {err ? (
          <div style={{ marginBottom: 12, fontSize: 13, color: "var(--danger)", background: "var(--danger-bg)", borderRadius: 12, padding: "9px 14px" }}>{err}</div>
        ) : null}
        {items.map((v) => (
          <Card key={v.id} style={{ marginBottom: 12, display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{ color: "var(--brand-ink)", marginTop: 2 }}><Icon name="compass" size={20} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.5 }}>“{v.text}”</div>
              {v.live ? (
                v.desc ? <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{v.desc}</div> : null
              ) : (
                <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-secondary)" }}>{v.linkedGoals} linked goal{v.linkedGoals === 1 ? "" : "s"}</div>
              )}
            </div>
            <button onClick={() => remove(v.id)} aria-label="Delete vision statement" style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
              <Icon name="x" size={15} />
            </button>
          </Card>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 4, maxWidth: 640 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Where is God taking this organisation?"
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: "9px 14px", fontSize: 14, background: "var(--surface-card)", color: "var(--text-primary)" }} />
          <Btn kind="gold" onClick={add} disabled={busy}><Icon name="plus" size={15} /> Add</Btn>
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

    // ── Team (live, spec §3.11 / mig 154) ──────────────────────────────
    // Demo keeps the local D.team list. In live mode the roster loads from
    // vision.org_members (display-safe names + roles); an org_admin can change a
    // member's role (PATCH) or remove them (DELETE), optimistic + revert. Invites
    // stay stubbed until a Supabase Admin/invite flow lands. Self-mutation is
    // hidden (an admin can't demote/remove themselves from here — the DELETE route
    // also blocks self-removal server-side; RLS is the real wall).
    const teamCtx = liveCtx();
    const teamLive = teamCtx.isLive;
    const MEMBER_ROLES = ["org_admin", "org_manager", "org_member", "org_viewer"];
    const [team, setTeam] = React.useState(D.team.map((m) => ({ ...m })));
    const [teamErr, setTeamErr] = React.useState(null);

    React.useEffect(() => {
      if (!teamLive || !teamCtx.authFetch) return;
      let cancelled = false;
      (async () => {
        try {
          const res = await teamCtx.authFetch("/api/orgs/" + D.orgId + "/members");
          if (!res.ok) return; // keep the demo roster rather than render nothing
          const j = await res.json();
          if (cancelled || !j || !j.data) return;
          setTeam(j.data.map(mapMember));
        } catch (e) { /* keep demo */ }
      })();
      return () => { cancelled = true; };
    }, [teamLive]);

    const changeRole = async (id, role) => {
      const prev = team;
      setTeam(team.map((m) => (m.id === id ? { ...m, role } : m))); // optimistic
      setTeamErr(null);
      try {
        const res = await teamCtx.authFetch("/api/orgs/" + D.orgId + "/members", {
          method: "PATCH", body: JSON.stringify({ id, role }),
        });
        if (!res.ok) throw new Error("Could not change role");
      } catch (e) { setTeamErr(e.message || "Could not change role"); setTeam(prev); }
    };

    const removeMember = async (id) => {
      const prev = team;
      setTeam(team.filter((m) => m.id !== id)); // optimistic
      setTeamErr(null);
      try {
        const res = await teamCtx.authFetch("/api/orgs/" + D.orgId + "/members?id=" + id, { method: "DELETE" });
        if (!res.ok) {
          let msg = "Could not remove member";
          try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) { /* noop */ }
          throw new Error(msg);
        }
      } catch (e) { setTeamErr(e.message || "Could not remove member"); setTeam(prev); }
    };

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
          {teamErr ? (
            <div style={{ marginBottom: 10, fontSize: 12.5, color: "var(--danger)", background: "var(--danger-bg)", borderRadius: 10, padding: "8px 12px" }}>{teamErr}</div>
          ) : null}
          {team.length === 0 ? (
            <div style={{ padding: "12px 0", fontSize: 13, color: "var(--text-secondary)" }}>No team members yet.</div>
          ) : team.map((m) => {
            const isSelf = teamLive && teamCtx.me && m.userId === teamCtx.me;
            const canManage = teamLive && teamCtx.role === "org_admin" && !isSelf;
            return (
              <div key={m.id || m.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--divider)" }}>
                {m.avatar ? (
                  <img src={m.avatar} alt="" width={32} height={32} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: "var(--surface-sunk)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13,
                  }}>{(m.name && m.name[0]) || "·"}</div>
                )}
                <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
                  {m.name}
                  {m.isFounder ? <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: "var(--gold-800)", background: "var(--gold-100)", borderRadius: 999, padding: "2px 7px" }}>Founder</span> : null}
                  {isSelf ? <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)" }}>you</span> : null}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{m.dept}</span>
                {canManage ? (
                  <>
                    <select value={m.role} onChange={(e) => changeRole(m.id, e.target.value)} aria-label="Member role"
                      style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "4px 8px", fontSize: 12, fontWeight: 700, background: "var(--surface-card)", color: "var(--text-primary)", cursor: "pointer" }}>
                      {MEMBER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button onClick={() => removeMember(m.id)} aria-label="Remove member" style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", verticalAlign: "middle" }}>
                      <Icon name="x" size={15} />
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: roleTone[m.role] || "var(--text-secondary)" }}>{m.role}</span>
                )}
              </div>
            );
          })}
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-tertiary)" }}>
            {teamLive
              ? (teamCtx.role === "org_admin"
                  ? "Change a member's role or remove them (org_admin, vision.user_org_roles — spec §3.11). Email invites arrive with the Supabase invite flow."
                  : "The roster is visible to every member; role changes are org_admin-gated (spec §3.11).")
              : "Invites & role changes are org_admin-gated (vision.user_org_roles — spec §3.11)."}
          </div>
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
