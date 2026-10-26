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
  const PlaceField = window.Screens.PlaceField; // place-field.jsx (optional Place on Log an activity)

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
  // `place` is the saved location_name; `onMap` is whether the Timeline Map can
  // plot the row (a real latitude + longitude — same test the map applies).
  const mapActivity = (a, metric) => {
    const pl = window.CV_PLACE.rowPlace(a);
    return {
      id: a.id,
      title: a.title,
      type: a.type || "other",
      date: a.date,
      place: pl.name,
      onMap: pl.onMap,
      // Kept so "edit this place" can put the pin back in the field. A name
      // with no real spot stores null, never a leftover coordinate.
      lat: pl.onMap ? Number(a.latitude) : null,
      lng: pl.onMap ? Number(a.longitude) : null,
      reach: metric ? metric.reach : null,
      engagement: metric ? metric.engagement_score : null,
      rating: metric ? metric.avg_rating : null,
      claimed: !!metric,
      live: true,
    };
  };
  // The Place field's value for a row that is about to be edited.
  const draftFromRow = (a) => {
    const PL = window.CV_PLACE;
    if (!a || !a.place) return PL.EMPTY;
    return {
      name: a.place,
      lat: a.onMap && a.lat != null ? a.lat : null,
      lng: a.onMap && a.lng != null ? a.lng : null,
    };
  };
  // Row after a place is saved (demo and the optimistic shape of a live save).
  const withPlace = (row, place) => {
    const p = window.CV_PLACE.normalise(place);
    if (!p) return row;
    return { ...row, place: p.name, onMap: p.lat !== null, lat: p.lat, lng: p.lng };
  };
  // Demo only: the Timeline Map reads D.mapActivities. A real spot is added or
  // replaced; a name with no spot is taken off the map.
  const syncDemoMap = (activity, place) => {
    const list = D.mapActivities;
    if (!list) return;
    const i = list.findIndex((r) => r && r.id === activity.id);
    const mapRow = window.CV_PLACE.demoMapRow(
      activity.id, activity.title, activity.type || "other", activity.date, place,
    );
    if (mapRow) {
      if (i >= 0) list[i] = mapRow;
      else list.unshift(mapRow);
    } else if (i >= 0) {
      list.splice(i, 1);
    }
  };
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
              <span style={{ color: "var(--accent-ink)" }}><Icon name="grid" size={20} /></span>
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
      D.spaces.map((s) => ({ id: s.id, name: s.name, icon: s.icon || "grid", color: s.color || "var(--accent-ink)", saved: s.name }))
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
        setSpaces([...spaces, { id: "sp-" + Date.now(), name: n, icon: "grid", color: "var(--accent-ink)", saved: n }]);
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
        setSpaces([...spaces, { id: s.id, name: s.name, icon: s.icon || "grid", color: s.colour || "var(--accent-ink)", saved: s.name }]);
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
  //
  // A row with no place offers "Add a place". A row that has one shows the
  // name, and that button edits it. Both open the Log form's PlaceField under
  // the row. Save sends PATCH /api/activities/:id (latitude, longitude,
  // location_name). A name with no coordinates is kept and says so. An earlier
  // pin is cleared only when that name actually changes to one with no map
  // location; the same name keeps its latitude and longitude. A real spot is
  // what the Timeline Map plots. The Spaces directory does not render activity
  // rows — this list is the only one.
  const ACTIVITY_TYPES = ["event", "meeting", "outreach", "workshop", "service", "training", "other"];
  const PLACE_NAME_ERROR = "Add a place name";
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  function Activities() {
    const { isLive, authFetch } = liveCtx();
    const [rows, setRows] = React.useState(D.activities.map((a) => ({ ...a })));
    const [title, setTitle] = React.useState("");
    const [type, setType] = React.useState("event");
    const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
    const [place, setPlace] = React.useState(window.CV_PLACE.EMPTY); // optional; see place-field.jsx
    const [err, setErr] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    // One row's place editor at a time. `draft` is the PlaceField value.
    const [editingId, setEditingId] = React.useState(null);
    const [draft, setDraft] = React.useState(window.CV_PLACE.EMPTY);
    const [placeErr, setPlaceErr] = React.useState(null);
    const [savingPlace, setSavingPlace] = React.useState(false);
    const savingPlaceRef = React.useRef(false);
    // Set just before the editor closes, so focus returns to that row's button
    // after it has painted (Escape, Cancel, and a successful save).
    const returnFocusId = React.useRef(null);

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
      // The place is optional: no place sends exactly { title, type, date }; a
      // place adds location_name, and latitude + longitude only when it has a real spot.
      const PL = window.CV_PLACE;
      const placeFields = PL.toPayload(place);
      const hasPlace = Object.keys(placeFields).length > 0;
      if (!isLive) {
        const id = "act-" + Date.now();
        const pl = PL.normalise(place);
        setRows([{
          id, title: t, type, space: "—", date,
          place: pl ? pl.name : "",
          onMap: !!(pl && pl.lat !== null),
          lat: pl ? pl.lat : null,
          lng: pl ? pl.lng : null,
          reach: null, engagement: null, rating: null, claimed: false, live: false,
        }, ...rows]);
        // The demo's Timeline Map reads D.mapActivities, so a demo activity with a
        // real spot appears there too (in memory only; a reload starts clean).
        const mapRow = PL.demoMapRow(id, t, type, date, place);
        if (mapRow) D.mapActivities.unshift(mapRow);
        setTitle(""); setPlace(PL.EMPTY); setErr(null); return;
      }
      setBusy(true); setErr(null);
      try {
        const res = await authFetch("/api/activities?org_id=" + D.orgId, {
          method: "POST", body: JSON.stringify({ title: t, type, date, ...placeFields }),
        });
        if (!res.ok) {
          throw new Error(res.status === 400 && hasPlace
            ? "Could not log activity. Check the place, or clear it and log again."
            : "Could not log activity");
        }
        const j = await res.json();
        setRows((cur) => [mapActivity(j.data, null), ...cur]);
        setTitle(""); setPlace(PL.EMPTY);
      } catch (e) { setErr(e.message || "Could not log activity"); }
      finally { setBusy(false); }
    };

    const remove = async (id) => {
      const prev = rows;
      setRows(rows.filter((x) => x.id !== id)); // optimistic
      if (editingId === id) { setEditingId(null); setPlaceErr(null); }
      if (!isLive) {
        const list = D.mapActivities;
        if (list) {
          const i = list.findIndex((r) => r && r.id === id);
          if (i >= 0) list.splice(i, 1);
        }
        return;
      }
      try {
        const res = await authFetch("/api/activities/" + id, { method: "DELETE" });
        if (!res.ok) throw new Error("Could not delete activity");
      } catch (e) { setErr(e.message || "Could not delete activity"); setRows(prev); }
    };

    React.useEffect(() => {
      const id = returnFocusId.current;
      if (!id || editingId === id) return;
      returnFocusId.current = null;
      const el = document.getElementById("cv-place-" + id);
      if (el) el.focus();
    }, [editingId]);
    const closeEditor = () => {
      if (savingPlaceRef.current) return;
      returnFocusId.current = editingId;
      setEditingId(null);
      setPlaceErr(null);
    };
    const openEditor = (a) => {
      if (savingPlaceRef.current) return;
      if (editingId === a.id) return;
      setEditingId(a.id);
      setDraft(draftFromRow(a));
      setPlaceErr(null);
    };
    const focusPlaceField = (id) => {
      const root = document.getElementById("cv-place-editor-" + id);
      const input = root && root.querySelector('[role="combobox"]');
      if (input) input.focus();
    };
    const savePlace = async () => {
      if (savingPlaceRef.current || !editingId) return;
      const PL = window.CV_PLACE;
      const id = editingId;
      const row = rows.find((r) => r.id === id);
      const committed = row ? PL.commitPlace(draft, {
        name: row.place || "",
        lat: row.onMap ? row.lat : null,
        lng: row.onMap ? row.lng : null,
      }) : null;
      if (!committed || !row) {
        setPlaceErr(PLACE_NAME_ERROR);
        focusPlaceField(id);
        return;
      }
      savingPlaceRef.current = true;
      setSavingPlace(true);
      setPlaceErr(null);
      try {
        if (!isLive) {
          setRows((cur) => cur.map((r) => (r.id === id ? withPlace(r, committed) : r)));
          syncDemoMap(row, committed);
          returnFocusId.current = id;
          setEditingId(null);
          return;
        }
        const res = await authFetch("/api/activities/" + id, {
          method: "PATCH",
          body: JSON.stringify(committed.patch),
        });
        const j = res.ok ? await res.json().catch(() => null) : null;
        if (!res.ok || !j || !j.data) throw new Error("Could not save this place. Try again.");
        const saved = mapActivity(j.data, null);
        setRows((cur) => cur.map((r) => (r.id === id ? {
          ...r, place: saved.place, onMap: saved.onMap, lat: saved.lat, lng: saved.lng,
        } : r)));
        returnFocusId.current = id;
        setEditingId(null);
      } catch (e) {
        setPlaceErr((e && e.message) || "Could not save this place. Try again.");
      } finally {
        savingPlaceRef.current = false;
        setSavingPlace(false);
      }
    };

    const cell = (v) => (v === null || v === undefined ? "—" : v);
    const col2 = isLive ? "Type" : "Space";
    const td = { padding: "11px 12px" };
    const headers = ["Activity", col2, "Date", "Reach", "Engagement", "Rating", ""];
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
                {headers.map((h) => (
                  <th key={h} style={{ padding: "10px 12px", fontWeight: 700, borderBottom: "1px solid var(--divider)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={headers.length} style={{ padding: "20px 12px", textAlign: "center", color: "var(--text-secondary)" }}>No activities yet. Log your first activity below.</td></tr>
              ) : rows.map((a) => {
                const editing = editingId === a.id;
                return (
                  <React.Fragment key={a.id}>
                    <tr style={{ borderBottom: editing ? "none" : "1px solid var(--divider)" }}>
                      <td style={{ ...td, fontWeight: 700, maxWidth: 360 }}>
                        {a.title}
                        {/* The place control sits under the title so a 375px screen still
                            shows it: the metric columns scroll, this column does not have to. */}
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, fontWeight: 700 }}>
                          <Btn
                            id={"cv-place-" + a.id}
                            kind="ghost"
                            aria-expanded={editing}
                            aria-controls={editing ? "cv-place-editor-" + a.id : undefined}
                            onClick={() => openEditor(a)}
                            style={{ color: "var(--brand-ink)", minHeight: 44, maxWidth: "100%", minWidth: 0 }}
                          >
                            <Icon name="map-pin" size={15} />
                            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {a.place ? a.place : "Add a place"}
                            </span>
                            {a.place ? <Icon name="pencil" size={15} /> : null}
                          </Btn>
                          {a.place && !a.onMap ? (
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Saved without a map position</div>
                          ) : null}
                          {a.place && a.onMap ? (
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>On the Timeline Map</div>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ ...td, color: "var(--text-secondary)" }}>{isLive ? cap(a.type) : a.space}</td>
                      <td style={{ ...td, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{a.date}</td>
                      <td style={td}>{cell(a.reach)}</td>
                      <td style={td}>{cell(a.engagement)}</td>
                      <td style={td}>{a.rating === null || a.rating === undefined ? "—" : a.rating + "★"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {a.claimed ? (
                          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--accent-ink)", background: "var(--surface-2)", borderRadius: 999, padding: "3px 9px", marginRight: 8 }}>
                            Claimed from Connect
                          </span>
                        ) : null}
                        <button type="button" onClick={() => remove(a.id)} aria-label={"Delete " + a.title} style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", verticalAlign: "middle" }}>
                          <Icon name="x" size={15} />
                        </button>
                      </td>
                    </tr>
                    {editing ? (
                      <tr style={{ borderBottom: "1px solid var(--divider)" }}>
                        <td id={"cv-place-editor-" + a.id} colSpan={headers.length}
                          style={{ padding: "4px 12px 14px", background: "var(--surface-card)", borderBottom: "1px solid var(--border)" }}
                          onKeyDown={(e) => {
                            if (e.key !== "Escape" || savingPlaceRef.current) return;
                            e.preventDefault();
                            closeEditor();
                          }}>
                          <PlaceField
                            autoFocus
                            value={draft}
                            onChange={(next) => {
                              setDraft(next);
                              if (window.CV_PLACE.cleanName(next && next.name)) {
                                setPlaceErr((cur) => (cur === PLACE_NAME_ERROR ? null : cur));
                              }
                            }}
                            onSubmit={savePlace}
                            error={placeErr === PLACE_NAME_ERROR ? placeErr : null}
                            loadMap={loadMapLibre}
                            env={window.__CV_ENV || {}}
                          />
                          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <Btn
                              kind="gold"
                              onClick={savePlace}
                              disabled={savingPlace || !window.CV_PLACE.cleanName(draft.name)}
                              style={{ minHeight: 44 }}
                            >
                              {savingPlace ? "Saving…" : "Save"}
                            </Btn>
                            <Btn kind="ghost" onClick={closeEditor} disabled={savingPlace} style={{ minHeight: 44 }}>Cancel</Btn>
                          </div>
                          {placeErr && placeErr !== PLACE_NAME_ERROR ? (
                            <div role="alert" style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>{placeErr}</div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
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
          <PlaceField value={place} onChange={setPlace} onSubmit={add} loadMap={loadMapLibre} env={window.__CV_ENV || {}} />
          <Btn kind="gold" onClick={add} disabled={busy}><Icon name="plus" size={15} /> Log</Btn>
        </div>
      </div>
    );
  }

  // ── Insights · Timeline Map (flagship) ─────────────────────────────
  // The org's geolocated activities on a map with a playback window: drag the
  // slider (or press Play) and the dots for "the last N days up to that date"
  // light up. A ring's size shows how many people the activity reached (size,
  // not distance on the ground); "Compare" greys in the window just before.
  // Live: GET /api/map/activities (RLS-gated, Bearer via authFetch). Demo:
  // D.mapActivities. The pure maths lives in timeline-lib.jsx (window.CV_TIMELINE).
  //
  // MapLibre is the vendored v6.11.2 copy Connect also ships (v6 dropped its UMD
  // build; GHSA-jrc7-96c5-q579) and is loaded on FIRST visit to this screen by
  // maplibre-loader.mjs, so nobody pays ~1 MB for a map they never open.
  let maplibreLoading = null;
  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (maplibreLoading) return maplibreLoading;
    maplibreLoading = new Promise((resolve, reject) => {
      if (!document.querySelector("link[data-cv-maplibre]")) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = new URL("vendor/maplibre-gl/maplibre-gl.css", document.baseURI).href;
        link.setAttribute("data-cv-maplibre", "");
        document.head.appendChild(link);
      }
      const done = () => { window.removeEventListener("cv-maplibre-ready", done); resolve(window.maplibregl); };
      window.addEventListener("cv-maplibre-ready", done);
      const script = document.createElement("script");
      script.type = "module";
      script.src = new URL("maplibre-loader.mjs?v=1", document.baseURI).href;
      script.onerror = () => {
        window.removeEventListener("cv-maplibre-ready", done);
        reject(new Error("The map could not be loaded."));
      };
      document.head.appendChild(script);
    }).catch((e) => { maplibreLoading = null; throw e; });
    return maplibreLoading;
  }

  const EMPTY_FC = { type: "FeatureCollection", features: [] };
  const fmtDay = (n) =>
    new Date(n * window.CV_TIMELINE.DAY_MS).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const SPAN_LABEL = { 7: "7 days", 30: "30 days", 90: "90 days", 365: "1 year" };

  function TimelineMap() {
    const TL = window.CV_TIMELINE;
    const { isLive, authFetch } = liveCtx();
    const env = window.__CV_ENV || {};
    const hostRef = React.useRef(null);
    const mapRef = React.useRef(null);
    const pointsRef = React.useRef([]);
    const [points, setPoints] = React.useState(() => (isLive ? [] : TL.toPoints(D.mapActivities)));
    const [loading, setLoading] = React.useState(isLive);
    const [loadErr, setLoadErr] = React.useState(null);
    const [mapErr, setMapErr] = React.useState(null);
    const [base, setBase] = React.useState("loading"); // loading | tiles | plain | refused
    const [epoch, setEpoch] = React.useState(0); // bumps on every (re)loaded style so filters re-apply
    const [span, setSpan] = React.useState(30);
    const [cursor, setCursor] = React.useState(null);
    const [playing, setPlaying] = React.useState(false);
    const [compare, setCompare] = React.useState(false);
    const [types, setTypes] = React.useState(() => new Set());
    const [selId, setSelId] = React.useState(null);
    const [noir, setNoir] = React.useState(() => TL.isDarkTheme(document.documentElement.getAttribute("data-theme")));

    pointsRef.current = points;
    const hasPoints = points.length > 0;
    const ex = React.useMemo(() => TL.extent(points), [points]);
    const cur = !ex ? 0 : Math.min(Math.max(cursor === null ? ex.max : cursor, ex.min), ex.max);
    const win = TL.windowAt(cur, span);
    const prevWin = TL.previousWindow(win);
    const typeList = React.useMemo(() => Array.from(new Set(points.map((p) => p.type))).sort(), [points]);
    const sel = points.find((p) => p.id === selId) || null;

    // Live rows.
    React.useEffect(() => {
      if (!isLive || !authFetch) return;
      let cancelled = false;
      (async () => {
        try {
          const res = await authFetch("/api/map/activities?org_id=" + D.orgId);
          if (!res.ok) throw new Error("Could not load your map (" + res.status + ").");
          const j = await res.json();
          if (!cancelled) setPoints(TL.toPoints(j.data));
        } catch (e) {
          if (!cancelled) setLoadErr(e.message || "Could not load your map.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [isLive]);

    // Follow the Light / Noir toggle (it only flips an attribute on <html>).
    React.useEffect(() => {
      const mo = new MutationObserver(() => setNoir(TL.isDarkTheme(document.documentElement.getAttribute("data-theme"))));
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => mo.disconnect();
    }, []);

    // Build the map once there is something to draw.
    React.useEffect(() => {
      if (loading || !hasPoints || !hostRef.current) return;
      let cancelled = false;
      let map = null;
      let refused = false;
      loadMapLibre().then((ml) => {
        if (cancelled || !hostRef.current) return;
        const theme = TL.isDarkTheme(document.documentElement.getAttribute("data-theme")) ? "dark" : "light";
        const url = TL.styleUrl(env, theme);
        try {
          map = new ml.Map({
            container: hostRef.current,
            style: url || TL.blankStyle(),
            center: [28.19, -25.75],
            zoom: 9,
            attributionControl: { compact: true },
          });
        } catch (e) {
          setMapErr("This browser cannot draw the map; the list below shows the same activities.");
          return;
        }
        mapRef.current = map;
        window.__cvMap = map; // handle for specs and the live walk (as Connect's window.__ccMap)
        setBase(url ? "tiles" : "plain");
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        const addLayers = () => {
          if (!map.getSource("cv-points")) map.addSource("cv-points", { type: "geojson", data: TL.featureCollection(pointsRef.current) });
          if (!map.getSource("cv-sel")) map.addSource("cv-sel", { type: "geojson", data: EMPTY_FC });
          const add = (def) => { if (!map.getLayer(def.id)) map.addLayer(def); };
          const paint = TL.mapPaint();
          add({ id: "cv-prev", type: "circle", source: "cv-points", filter: TL.NOTHING,
            paint: { "circle-radius": TL.ringRadiusExpr(), "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": paint.muted, "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.75 } });
          add({ id: "cv-ring", type: "circle", source: "cv-points", filter: TL.NOTHING,
            paint: { "circle-radius": TL.ringRadiusExpr(), "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": paint.accent, "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.6 } });
          add({ id: "cv-dot", type: "circle", source: "cv-points", filter: TL.NOTHING,
            paint: { "circle-radius": TL.dotRadiusExpr(), "circle-color": paint.accent, "circle-stroke-color": paint.paper, "circle-stroke-width": 1.5, "circle-opacity": 0.92 } });
          add({ id: "cv-sel", type: "circle", source: "cv-sel",
            paint: { "circle-radius": ["+", 4, TL.ringRadiusExpr()], "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": paint.text, "circle-stroke-width": 2.5 } });
        };
        map.on("style.load", () => { addLayers(); setEpoch((n) => n + 1); });
        map.on("error", (ev) => {
          // A key MapTiler refuses for this origin (401/403): keep the activity, drop the tiles.
          if (!refused && url && TL.isKeyRefusal(ev && ev.error)) {
            refused = true;
            setBase("refused");
            map.setStyle(TL.blankStyle());
          }
        });
        map.on("click", (ev) => {
          const hit = map.getLayer("cv-dot") ? map.queryRenderedFeatures(ev.point, { layers: ["cv-dot"] }) : [];
          setSelId(hit.length ? hit[0].properties.id : null);
        });
        map.on("mousemove", "cv-dot", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "cv-dot", () => { map.getCanvas().style.cursor = ""; });
        const bb = TL.bounds(pointsRef.current);
        if (bb) map.fitBounds(bb, { padding: 70, maxZoom: 12, duration: 0 });
      }).catch((e) => { if (!cancelled) setMapErr((e && e.message) || "The map could not be loaded."); });
      return () => {
        cancelled = true;
        if (map) map.remove();
        if (window.__cvMap === map) window.__cvMap = null;
        mapRef.current = null;
      };
    }, [hasPoints, loading]);

    // Switching Light / Noir swaps the base style. The plain ground reads --surface-0.
    React.useEffect(() => {
      const map = mapRef.current;
      if (!map || base === "loading") return;
      if (base === "tiles") {
        const url = TL.styleUrl(env, noir ? "dark" : "light");
        if (url) map.setStyle(url);
      } else {
        map.setStyle(TL.blankStyle());
      }
    }, [noir]);

    // The playback window, the type filter and Compare drive three layer filters.
    React.useEffect(() => {
      const map = mapRef.current;
      if (!map || !map.getLayer("cv-dot")) return;
      const f = TL.windowFilter(win, types);
      map.setFilter("cv-dot", f);
      map.setFilter("cv-ring", f);
      map.setFilter("cv-prev", compare ? TL.windowFilter(prevWin, types) : TL.NOTHING);
    }, [epoch, cur, span, types, compare]);

    // The selected activity's outline.
    React.useEffect(() => {
      const map = mapRef.current;
      const src = map && map.getSource && map.getSource("cv-sel");
      if (!src) return;
      src.setData(sel ? TL.featureCollection([sel]) : EMPTY_FC);
    }, [epoch, selId, points]);

    // Play: step the cursor to the end, then stop.
    React.useEffect(() => {
      if (!playing || !ex) return;
      const id = setInterval(() => {
        setCursor((c) => {
          const next = (c === null ? ex.max : c) + TL.playStep(span);
          if (next >= ex.max) { setPlaying(false); return ex.max; }
          return next;
        });
      }, 650);
      return () => clearInterval(id);
    }, [playing, span, ex && ex.max]);

    const togglePlay = () => {
      if (playing) { setPlaying(false); return; }
      if (ex && cur >= ex.max) setCursor(ex.min); // replay from the start
      setPlaying(true);
    };
    const toggleType = (t) => {
      setTypes((cur0) => {
        const n = new Set(cur0);
        if (n.has(t)) n.delete(t); else n.add(t);
        return n;
      });
    };

    const now = TL.summarise(points, win, types);
    const before = TL.summarise(points, prevWin, types);
    const inWindow = points
      .filter((p) => p.t >= win.from && p.t <= win.to && (types.size === 0 || types.has(p.type)))
      .sort((a, b) => b.t - a.t);
    const note = base === "plain"
      ? "The street map is switched off for this site, so your activities are shown on a plain background."
      : base === "refused"
        ? "The street-map provider did not accept this site, so your activities are shown on a plain background."
        : null;

    if (loading) {
      return (
        <div className="fade-in">
          <SectionTitle>Timeline map</SectionTitle>
          <Card><div style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading your map…</div></Card>
        </div>
      );
    }
    if (loadErr) {
      return (
        <div className="fade-in">
          <SectionTitle>Timeline map</SectionTitle>
          <div style={{ fontSize: 13, color: "var(--danger)", background: "var(--danger-bg)", borderRadius: 12, padding: "9px 14px" }}>{loadErr}</div>
        </div>
      );
    }
    if (!hasPoints) {
      return (
        <div className="fade-in">
          <SectionTitle>Timeline map</SectionTitle>
          <Card style={{ minHeight: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <span style={{ color: "var(--brand-ink)" }}><Icon name="map" size={36} /></span>
            <div style={{ marginTop: 12, fontWeight: 800, fontSize: 16 }}>No activities with a place yet</div>
            <div style={{ marginTop: 8, maxWidth: 460, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              The map plots every activity that has a place on the map. Add a place when you log
              an activity, or on one already in the log (Spaces, then Activities), and it appears here.
            </div>
          </Card>
        </div>
      );
    }

    const pillRow = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
    return (
      <div className="fade-in">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <SectionTitle>Timeline map</SectionTitle>
          {!isLive ? (
            <span title="Sample activities for the demo organisation."
              style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", background: "var(--surface-sunk)", borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" }}>
              sample data
            </span>
          ) : null}
        </div>

        <div style={{ ...pillRow, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Window</span>
          {TL.SPANS.map((s) => (
            <Pill key={s} active={span === s} onClick={() => setSpan(s)}>{SPAN_LABEL[s]}</Pill>
          ))}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, marginLeft: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            Compare with the window before
          </label>
        </div>
        {typeList.length > 1 ? (
          <div style={{ ...pillRow, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Type</span>
            <Pill active={types.size === 0} onClick={() => setTypes(new Set())}>All</Pill>
            {typeList.map((t) => (
              <Pill key={t} active={types.has(t)} onClick={() => toggleType(t)}>{cap(t)}</Pill>
            ))}
          </div>
        ) : null}

        <Card style={{ padding: 0, overflow: "hidden", position: "relative" }}>
          <div ref={hostRef} role="img" aria-label="Map of your activities"
            style={{ height: 440, width: "100%", background: "var(--surface-sunk)" }} />
          {base === "tiles" ? (
            <a href="https://www.maptiler.com" target="_blank" rel="noopener noreferrer" data-cv-maptiler-logo=""
              style={{ position: "absolute", left: 10, bottom: 10, display: "inline-block", lineHeight: 0, padding: "3px 6px", borderRadius: "var(--radius-full)", background: "var(--scrim)" }}>
              <img src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler logo" width="67" height="20" decoding="async" />
            </a>
          ) : null}
        </Card>
        {note ? <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>{note}</div> : null}
        {mapErr ? <div style={{ marginTop: 8, fontSize: 13, color: "var(--danger)" }}>{mapErr}</div> : null}

        <Card style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Btn kind="gold" onClick={togglePlay}>{playing ? "Pause" : "Play"}</Btn>
            <input type="range" min={ex.min} max={ex.max} value={cur} step={1}
              aria-label="Playback date"
              onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }}
              style={{ flex: 1, minWidth: 160 }} />
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>
            {fmtDay(win.from)} – {fmtDay(win.to)}
          </div>
          <div style={{ marginTop: 4, fontSize: 15, fontWeight: 800 }} aria-live="polite">
            {TL.summaryLine(now, before, compare)}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-tertiary)" }}>
            A ring's size shows how many people the activity reached, not how far away it was.
            Dates are the dates you logged; people are the participant counts you entered.
          </div>
        </Card>

        {sel ? (
          <Card style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{sel.title}</div>
            <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-secondary)" }}>
              {cap(sel.type)} · {fmtDay(sel.t)}{sel.dept ? " · " + sel.dept : ""}{sel.place ? " · " + sel.place : ""}
            </div>
            <div style={{ marginTop: 6, fontSize: 13.5 }}>
              {sel.people} {sel.people === 1 ? "person" : "people"} reached
            </div>
          </Card>
        ) : null}

        <details open={!!mapErr} style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
            Show the {inWindow.length} {inWindow.length === 1 ? "activity" : "activities"} in this window as a list
          </summary>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {inWindow.slice(0, 60).map((p) => (
              <li key={p.id}>
                <button onClick={() => setSelId(p.id)}
                  style={{ width: "100%", textAlign: "left", border: "1px solid var(--border)", borderRadius: 10, background: selId === p.id ? "var(--surface-2)" : "var(--surface-card)", color: "var(--text-primary)", padding: "8px 12px", cursor: "pointer", fontSize: 13 }}>
                  <strong>{p.title}</strong> · {fmtDay(p.t)} · {p.people} {p.people === 1 ? "person" : "people"}{p.place ? " · " + p.place : ""}
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>
    );
  }

  // ── Insights · Community Network (spec §4.3, the network graph) ─────
  // "Which organisations share your audience? Who could you serve alongside?"
  // A star: your organisation in the middle, the others round it; closer and
  // thicker = more community members shared, bigger = a bigger audience of its
  // own. It shows ORGANISATIONS AND COUNTS ONLY. Never a person, and a pair
  // only appears from 3 shared people (the reader, migration 182, enforces both).
  // The numbers are an association ("your people also take part there"), not a
  // cause, and the screen says so. Live: GET /api/metrics/shared-audience.
  // Demo: D.networkSample. Pure maths: network-lib.jsx (window.CV_NETWORK).
  const NET_DAYS = [30, 90, 365];
  function Network() {
    const NW = window.CV_NETWORK;
    const { isLive, authFetch } = liveCtx();
    const [days, setDays] = React.useState(90);
    const [rows, setRows] = React.useState(() => (isLive ? [] : NW.mapRows(D.networkSample)));
    const [loading, setLoading] = React.useState(isLive);
    const [err, setErr] = React.useState(null);
    const [selId, setSelId] = React.useState(null);

    React.useEffect(() => {
      if (!isLive || !authFetch) return;
      let cancelled = false;
      setLoading(true);
      setErr(null);
      (async () => {
        try {
          const res = await authFetch("/api/metrics/shared-audience?org_id=" + D.orgId + "&days=" + days);
          if (!res.ok) throw new Error("Could not load your network (" + res.status + ").");
          const j = await res.json();
          if (!cancelled) { setRows(NW.mapRows(j.data)); setSelId(null); }
        } catch (e) {
          if (!cancelled) setErr(e.message || "Could not load your network.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [isLive, days]);

    const box = { width: 720, height: 460 };
    const L = React.useMemo(() => NW.layout(rows, box), [rows]);
    const sel = rows.find((r) => r.id === selId) || null;
    const myName = (D.org && D.org.name) || "Your organisation";
    const pick = (id) => setSelId((cur) => (cur === id ? null : id));

    return (
      <div className="fade-in">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <SectionTitle>Community network</SectionTitle>
          {!isLive ? (
            <span title="Sample organisations for the demo organisation."
              style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", background: "var(--surface-sunk)", borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" }}>
              sample data
            </span>
          ) : null}
        </div>

        {isLive ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>Window</span>
            {NET_DAYS.map((d) => (
              <Pill key={d} active={days === d} onClick={() => setDays(d)}>{d === 365 ? "1 year" : d + " days"}</Pill>
            ))}
          </div>
        ) : null}

        {loading ? (
          <Card><div style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading your network…</div></Card>
        ) : err ? (
          <div style={{ fontSize: 13, color: "var(--danger)", background: "var(--danger-bg)", borderRadius: 12, padding: "9px 14px" }}>{err}</div>
        ) : rows.length === 0 ? (
          <Card style={{ minHeight: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <span style={{ color: "var(--brand-ink)" }}><Icon name="layers" size={36} /></span>
            <div style={{ marginTop: 12, fontWeight: 800, fontSize: 16 }}>{NW.headline([], days)}</div>
            <div style={{ marginTop: 8, maxWidth: 480, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Organisations appear here when the same people take part in your activities and in
              theirs. Your organisation also needs to be linked to its Connect listing.
            </div>
          </Card>
        ) : (
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }} aria-live="polite">
              {NW.headline(rows, days)}
            </div>
            <Card style={{ padding: 8 }}>
              <svg viewBox={(-box.width / 2) + " " + (-box.height / 2) + " " + box.width + " " + box.height}
                role="group" aria-label="Organisations that share your community members"
                style={{ width: "100%", height: "auto", display: "block" }}>
                {L.nodes.map((n, i) => (
                  <line key={"e" + n.id} x1="0" y1="0" x2={n.x} y2={n.y} strokeLinecap="round"
                    style={{ stroke: "var(--accent-ink)", strokeWidth: L.edges[i].w, opacity: selId && selId !== n.id ? 0.25 : 0.6 }} />
                ))}
                <circle cx="0" cy="0" r={L.center.r} style={{ fill: "var(--brand)", stroke: "var(--brand-strong)", strokeWidth: 2 }} />
                <text x="0" y="5" textAnchor="middle" style={{ fontSize: 15, fontWeight: 800, fill: "var(--on-brand)" }}>{NW.initials(myName)}</text>
                <text x="0" y={L.center.r + 16} textAnchor="middle" style={{ fontSize: 11.5, fontWeight: 700, fill: "var(--text-secondary)" }}>{NW.clip(myName, 24)}</text>
                {L.nodes.map((n, i) => {
                  const row = rows[i];
                  const on = selId === n.id;
                  return (
                    <g key={n.id} role="button" tabIndex={0} style={{ cursor: "pointer", outline: "none" }}
                      aria-pressed={on}
                      aria-label={n.name + ": " + n.shared + " shared community members"}
                      onClick={() => pick(n.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(n.id); } }}>
                      <circle cx={n.x} cy={n.y} r={n.r + (on ? 5 : 0)}
                        style={{ fill: "var(--surface-card)", stroke: on ? "var(--text-primary)" : "var(--accent-ink)", strokeWidth: on ? 3 : 2 }} />
                      <text x={n.x} y={n.y + 4} textAnchor="middle" style={{ fontSize: Math.max(10, n.r * 0.6), fontWeight: 800, fill: "var(--text-primary)", pointerEvents: "none" }}>{NW.initials(n.name)}</text>
                      <text x={n.x} y={n.y + n.r + 15} textAnchor="middle" style={{ fontSize: 11.5, fontWeight: 700, fill: "var(--text-primary)", pointerEvents: "none" }}>{NW.clip(n.name, 20)}</text>
                      <text x={n.x} y={n.y + n.r + 28} textAnchor="middle" style={{ fontSize: 11, fill: "var(--text-secondary)", pointerEvents: "none" }}>{row.shared} shared</text>
                    </g>
                  );
                })}
              </svg>
            </Card>

            {sel ? (
              <Card style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{sel.name}</div>
                <div style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.6 }}>{NW.describe(sel, myName)}</div>
                <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                  A conversation could help you both serve these people well.
                </div>
              </Card>
            ) : null}

            <details open style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>The same organisations as a list</summary>
              <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {rows.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => pick(r.id)}
                      style={{ width: "100%", textAlign: "left", border: "1px solid var(--border)", borderRadius: 10, background: selId === r.id ? "var(--surface-2)" : "var(--surface-card)", color: "var(--text-primary)", padding: "8px 12px", cursor: "pointer", fontSize: 13 }}>
                      <strong>{r.name}</strong> · {r.shared} shared · {r.shared} of your {r.mine} ({NW.fmtPct(r.pctMine)}) · {r.shared} of their {r.theirs} ({NW.fmtPct(r.pctTheirs)})
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6, maxWidth: 640 }}>
          This shows organisations and counts only; it never names a person. A pair appears only
          when at least {NW.MIN_SHARED} people are shared, so no individual can be picked out. It is an
          association ("your community members also take part there"), not a cause.
        </div>
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
                  {m.isFounder ? <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: "var(--accent-ink)", background: "var(--surface-2)", borderRadius: 999, padding: "2px 7px" }}>Founder</span> : null}
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
    Spaces, ConfigureSpaces, Activities, TimelineMap, Network, Feed, Analytics,
    Coverage, Advisories, Reports, Objectives, Projects, VisionStatements, Settings,
  });
})();
