// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — live-data overlay (demo → live wiring, spec §3)
//  ------------------------------------------------------------------
//  With a real (non-demo) session, fetch the org's live Connect metrics
//  from /api/* (Bearer via CV_STORE.authFetch) and overlay them onto
//  window.CV_DATA in exactly the narrative-engine shapes — data.jsx is
//  the contract (build plan §4): the RPC rows drop into the template
//  slots, nothing else changes. On ANY failure the demo data stays
//  untouched, so the app always renders.
//
//  Wired live here: Home pulse + observations, Analytics Reach / Growth
//  / Retention / Engagement, org name, and the Advisories feed + home
//  banner (the DB engine `evaluate_advisory_rules` — mig 149 — generates
//  server-side; the rows arrive pre-rendered via /api/advisory), plus the
//  Analytics Funnel + Broadcast tabs (mig 150 readers) and the Spaces
//  directory (per-space reach / people / activities / trend — mig 151
//  reach_per_space / engagement_per_space, via /api/spaces), plus the
//  Cross-Pollination observation (mig 155 cross_pollination, via
//  /api/metrics/cross-pollination — the "de-scattering" signal, §4.2), plus
//  the Dormancy early-warning advisory (mig 156 dormancy_watch, via
//  /api/metrics/dormancy — the de-scattering GUARDIAN, §4.5: which orbit
//  contributors have gone quiet).
//  Activities / Goals CRUD wiring is a separate increment; a null reader row
//  leaves that one surface on its sample data rather than sinking the overlay.
// ════════════════════════════════════════════════════════════════════
(() => {
  const D = window.CV_DATA;

  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const fmtPct = (v) => (v === null || v === undefined ? null : (Number(v) > 0 ? "+" : "") + Number(v) + "%");
  const pctText = (v) => (v === null || v === undefined ? "—" : Number(v) + "%"); // no sign — conversion rates
  const pctCount = (pct, a, b) => pctText(pct) + " (" + num(a) + "/" + num(b) + ")"; // Display Convention #8
  const trendVerb = (pct) => (Number(pct) >= 0 ? "climbed" : "slipped");
  const sevFromDelta = (pct) =>
    pct === null || pct === undefined ? "info" : Number(pct) < -10 ? "warning" : Number(pct) > 10 ? "good" : "info";
  const toneFromDelta = (pct) =>
    pct === null || pct === undefined ? "warn" : Number(pct) < 0 ? "bad" : "good";

  async function getJson(path) {
    const res = await window.CV_STORE.authFetch(path);
    if (!res.ok) throw new Error(path + " -> " + res.status);
    return res.json();
  }

  // Mutates window.CV_DATA with the live rows. Shapes mirror data.jsx —
  // the `data` keys ARE the calc contract, so the templates keep working.
  function applyOverlay(org, m, advisories, spaces, xpoll, dormancy) {
    const period = m.period || "month";
    const g = {};
    (m.growth || []).forEach((row) => { g[row.metric_name] = row; });
    const reach = m.reach;
    const eng = m.engagement;
    const ret = m.retention;
    const series = m.series || [];
    const sVals = (key) => series.map((r) => Number(r[key] || 0));
    const chartOf = (key) => (series.length >= 2 ? sVals(key) : null);
    const hasDelta = (row) =>
      !!row && row.growth_pct !== null && row.growth_pct !== undefined && Number(row.previous_value) !== 0;

    D.mode = "live";
    D.orgId = org.id; // the Vision org id — the dismiss round-trip needs it
    D.org = Object.assign({}, D.org, { name: org.name });

    // ── Kingdom pulse — live cards only, counts beside deltas ──────────
    const pulse = [];
    if (reach) {
      pulse.push({
        label: "People reached",
        value: String(num(reach.total_reach)),
        delta: hasDelta(g.reach) ? fmtPct(g.reach.growth_pct) : num(reach.event_count) + " events",
        tone: hasDelta(g.reach) ? toneFromDelta(g.reach.growth_pct) : "good",
      });
    }
    if (eng) {
      pulse.push({
        label: "Engagement score",
        value: String(num(eng.engagement_score)),
        delta: hasDelta(g.engagement) ? fmtPct(g.engagement.growth_pct) : "of 100",
        tone: hasDelta(g.engagement) ? toneFromDelta(g.engagement.growth_pct) : "good",
      });
    }
    if (ret) {
      const pct = num(ret.retention_pct);
      pulse.push({
        label: "Retention",
        value: pct === null ? "—" : pct + "%",
        delta: "(" + num(ret.returning_count) + "/" + num(ret.previous_distinct) + ")",
        tone: pct === null ? "warn" : pct >= 60 ? "good" : pct >= 40 ? "warn" : "bad",
      });
    }
    if (g.active_events) {
      pulse.push({
        label: "Active events",
        value: String(num(g.active_events.current_value)),
        delta: hasDelta(g.active_events) ? fmtPct(g.active_events.growth_pct) : "this " + period,
        tone: hasDelta(g.active_events) ? toneFromDelta(g.active_events.growth_pct) : "good",
      });
    }
    if (pulse.length) D.pulse = pulse;

    // ── Observations + Analytics (RGRE) ────────────────────────────────
    const observations = [];

    if (reach) {
      const live = hasDelta(g.reach);
      const data = {
        current: num(reach.total_reach),
        period,
        events: num(reach.event_count),
        impressions: num(reach.impression_total),
        attending: num(reach.attending_total),
      };
      if (live) {
        data.prev = num(g.reach.previous_value);
        data.deltaPct = fmtPct(g.reach.growth_pct);
        data.trendVerb = trendVerb(g.reach.growth_pct);
      }
      const obs = {
        id: "live-reach", type: "reach",
        severity: sevFromDelta(live ? g.reach.growth_pct : null),
        neutral: !live,
        bodyKey: "bodyNoAttribution", // per-event attribution lands with spec §3.4a breakdowns
        data,
        contributions: [],
        chart: chartOf("reach_total"),
      };
      observations.push(obs);
      D.analytics.reach = {
        type: "reach", neutral: obs.neutral, bodyKey: obs.bodyKey, data,
        series: obs.chart || [],
        evidence: [
          ["Reached this " + period, String(data.current)],
          ["Events", String(data.events)],
          ["Impressions", String(data.impressions)],
        ].concat(live ? [
          ["Previous " + period, String(data.prev)],
          ["Delta", data.deltaPct],
        ] : []),
      };
    }

    if (eng) {
      const live = hasDelta(g.engagement);
      const data = {
        state: live ? (Number(g.engagement.growth_pct) >= 0 ? "improving" : "cooling") : "steady",
        score: num(eng.engagement_score),
        period,
        topComponent: eng.top_component,
      };
      if (live) data.deltaPct = fmtPct(g.engagement.growth_pct);
      const obs = {
        id: "live-engagement", type: "engagement",
        severity: sevFromDelta(live ? g.engagement.growth_pct : null),
        neutral: !live,
        data,
        contributions: [],
        chart: chartOf("engagement_score"),
      };
      observations.push(obs);
      D.analytics.engagement = {
        type: "engagement", neutral: obs.neutral, data,
        series: obs.chart || [],
        evidence: [
          ["Weighted score", num(eng.engagement_score) + "/100"],
          ["Top component", String(eng.top_component || "—")],
          ["Followers", String(num(eng.followers_total))],
          ["Reviews", String(num(eng.reviews_total))],
          ["Attending", String(num(eng.attending_total))],
        ],
      };
    }

    if (ret) {
      const pct = num(ret.retention_pct);
      const data = {
        subject: "Community",
        state: pct === null ? "steady" : pct >= 60 ? "healthy" : pct >= 40 ? "softening" : "declining",
        pct: pct === null ? "—" : pct + "%",
        ret: num(ret.returning_count),
        prev: num(ret.previous_distinct),
        churned: num(ret.churned_count),
        period,
        // {hotspot} lands with per-Space retention (spec §3.4c + spaces)
      };
      const obs = {
        id: "live-retention", type: "retention",
        severity: pct === null ? "info" : pct >= 60 ? "good" : "warning",
        neutral: pct === null,
        bodyKey: "bodyNoHotspot",
        data,
        contributions: [],
        chart: chartOf("distinct_persons"),
      };
      observations.push(obs);
      D.analytics.retention = {
        type: "retention", neutral: obs.neutral, bodyKey: obs.bodyKey, data,
        series: obs.chart || [],
        evidence: [
          ["Returned", num(ret.returning_count) + "/" + num(ret.previous_distinct)],
          ["Rate", pct === null ? "—" : pct + "%"],
          ["New", String(num(ret.new_count))],
          ["Churned", String(num(ret.churned_count))],
        ],
      };
    }

    if (g.reach) {
      const live = hasDelta(g.reach);
      const data = {
        metric: "Reach",
        state: live ? (Number(g.reach.growth_pct) >= 0 ? "accelerating" : "slowing") : "steady",
        current: num(g.reach.current_value),
        prev: num(g.reach.previous_value),
        period,
      };
      if (live) data.deltaPct = fmtPct(g.reach.growth_pct);
      D.analytics.growth = {
        type: "growth", neutral: !live, data,
        series: chartOf("reach_total") || [],
        evidence: (m.growth || []).map((row) => [
          row.metric_name,
          (row.current_value === null ? "—" : row.current_value) + " vs " +
          (row.previous_value === null ? "—" : row.previous_value) +
          (row.growth_pct === null || row.growth_pct === undefined ? "" : " (" + fmtPct(row.growth_pct) + ")"),
        ]),
      };
    }

    // ── Cross-pollination / de-scattering (spec §4.2 / mig 155) ────────
    // The Body's most VISION-central signal: are THIS org's engaged citizens
    // discovering organisations they'd never met before? Neutral (an honest
    // stable sentence, no fabricated headline) when nobody discovered a new org
    // this window — the counts still show in Evidence, so a sparse org never
    // reads worse than the demo. Skipped entirely on a null row (a fetch failure
    // or unlinked org keeps the demo/sample observation) so it never sinks the feed.
    if (xpoll) {
      const aud = num(xpoll.audience_size);
      const disc = num(xpoll.citizens_discovering);
      const pct = num(xpoll.discovery_rate_pct);
      const avg = xpoll.avg_new_orgs_per_citizen;
      const days = (xpoll.period_start && xpoll.period_end)
        ? Math.round((new Date(xpoll.period_end) - new Date(xpoll.period_start)) / 86400000) + 1
        : 90;
      observations.push({
        id: "live-crosspollination", type: "crossPollination",
        severity: disc ? "good" : "info",
        neutral: !disc, // 0 or null discoveries → the honest neutral sentence
        data: {
          citizensDiscovering: disc, audienceSize: aud,
          discoveryPct: pct === null ? "—" : pct + "% (" + disc + "/" + aud + ")",
          newConnections: num(xpoll.new_connections),
          distinctNewOrgs: num(xpoll.distinct_new_orgs),
          avgPerCitizen: (avg === null || avg === undefined) ? "—" : avg + " orgs/citizen",
          windowDays: days,
        },
        contributions: [],
        chart: null, // no per-period discovery series yet — honest "No trend series"
      });
    }

    if (observations.length) D.observations = observations;

    // Advisories (spec §3.7c) — the DB engine substitutes title/body server-
    // side, so each row carries finished copy + its num/den in `data` (the
    // ObservationCard renders obs.title/body directly for pre-rendered rows).
    // No rows = genuinely all-clear; the demo advisories never leak into live.
    const advRows = (advisories || []).map((a) => ({
      id: a.id,
      type: (a.advisory_templates && a.advisory_templates.type) || a.type || "advisory",
      severity: a.severity,
      title: a.title,
      body: a.body,
      data: a.data || {},
      contributions: [],
      chart: null,
    }));

    // ── Dormancy early-warning (spec §4.5 / mig 156) ───────────────────
    // The de-scattering guardian: which OTHER contributor orgs THIS org's
    // audience engages with have gone quiet? Synthesized from the separate
    // dormancy_watch fetch (NOT the mig-149 engine), so it carries no
    // pre-rendered title → ObservationCard fills the narrative template
    // client-side (same path as the demo advisory). Only surfaced when there is
    // an orbit to watch (orbit_size > 0); neutral (honest "all active") when the
    // orbit has nobody quiet; the bodyNoNames variant covers a Connect directory
    // that couldn't resolve the public org names. Dropped entirely on a null row
    // (unlinked org or fetch failure) so it never sinks the advisories feed.
    if (dormancy && num(dormancy.orbit_size) > 0) {
      const count = num(dormancy.dormant_count);
      const names = Array.isArray(dormancy.names) ? dormancy.names.filter(Boolean) : [];
      advRows.unshift({
        id: "live-dormancy",
        type: "dormancy",
        severity: count > 0 ? "warning" : "good",
        neutral: count === 0,
        bodyKey: names.length ? undefined : "bodyNoNames",
        data: {
          count,
          days: num(dormancy.threshold_days),
          names: names.length ? names.join(", ") : null,
          orbit: num(dormancy.orbit_size),
        },
        contributions: [],
        chart: null,
      });
    }

    D.advisories = advRows;

    // ── Funnel (spec §3.4a / mig 150) ──────────────────────────────────
    // Impression → Consider → Attend → Review → Follow. Neutral (stable
    // sentence, no fabricated headline) when there are no impressions to
    // convert — the counts still show in Evidence/Charts, so a sparse org
    // never reads worse than the demo. Falls back to demo only on a null row.
    if (m.funnel) {
      const f = m.funnel;
      D.analytics.funnel = {
        type: "funnel",
        neutral: f.impression_to_attend_pct === null || f.impression_to_attend_pct === undefined,
        series: [num(f.impressions), num(f.considering), num(f.attending), num(f.reviews), num(f.follows)],
        stages: ["Impressions", "Considering", "Attending", "Reviewed", "Followed"],
        data: {
          convPct: pctText(f.impression_to_attend_pct),
          action: "attended",
          impressions: num(f.impressions), considering: num(f.considering),
          attending: num(f.attending), reviews: num(f.reviews), follows: num(f.follows), period,
        },
        evidence: [
          ["Impression → Attend", pctCount(f.impression_to_attend_pct, f.attending, f.impressions)],
          ["Attend → Review", pctCount(f.attend_to_review_pct, f.reviews, f.attending)],
          ["Review → Follow", pctCount(f.review_to_follow_pct, f.follows, f.reviews)],
        ],
      };
    } else if (D.analytics.funnel) {
      D.analytics.funnel.demo = true;
    }

    // ── Broadcast effectiveness (spec §3.4d / mig 150) ─────────────────
    // 48h RSVP/follow conversion + reactions. Neutral when nothing was sent.
    // No per-broadcast time series yet → the chart shows its build-up note.
    if (m.broadcast) {
      const b = m.broadcast;
      const sent = num(b.broadcasts_sent);
      D.analytics.broadcast = {
        type: "broadcast",
        neutral: sent === 0,
        series: [],
        data: {
          convPct: pctText(b.conversion_pct),
          sent, audience: num(b.audience_total),
          rsvps: num(b.rsvps_within_48h), follows: num(b.follows_within_48h), period,
        },
        evidence: [
          ["Broadcasts sent", String(sent)],
          ["Audience", String(num(b.audience_total))],
          ["48h RSVPs", String(num(b.rsvps_within_48h))],
          ["48h follows", String(num(b.follows_within_48h))],
          ["Reactions", String(num(b.reactions_total))],
        ],
      };
    } else if (D.analytics.broadcast) {
      D.analytics.broadcast.demo = true;
    }

    // ── Spaces directory (spec §3.5b / mig 151) ────────────────────────
    // reach_per_space + engagement_per_space, one row per space, keyed to the
    // demo card shape { id, name, icon, color, activities, people, reach,
    // trend }. Only overlaid when the fetch succeeded (spaces !== null) — an
    // empty array is a REAL empty directory (org has no spaces yet), honest, so
    // the Configure Spaces prompt shows rather than fabricated sample spaces. A
    // fetch failure keeps the demo spaces (spaces stays null here).
    if (Array.isArray(spaces)) {
      D.spaces = spaces.map((s) => ({
        id: s.id,
        name: s.name,
        icon: s.icon || "grid",
        color: s.colour || "var(--gold-600)",
        activities: num(s.activities) || 0,
        people: num(s.people) || 0,
        reach: num(s.reach) || 0,
        engagement: num(s.engagement) || 0,
        topComponent: s.top_component || null,
        trend: Array.isArray(s.trend) ? s.trend.map(Number) : [],
      }));
    }
  }

  // loading → live | demo (with a human reason, surfaced by the Shell badge)
  function useLiveData(auth) {
    const [state, setState] = React.useState({ mode: "demo", reason: "Demo data" });

    React.useEffect(() => {
      if (auth.status !== "signedIn" || auth.demo) {
        setState({ mode: "demo", reason: "Demo session — sample data" });
        return;
      }
      let cancelled = false;
      (async () => {
        const orgs = await getJson("/api/orgs");
        const rows = (orgs && orgs.data) || [];
        if (!rows.length) {
          if (!cancelled) setState({ mode: "demo", reason: "No organisation yet — showing sample data" });
          return;
        }
        const preferred = rows.find((r) => r.role === "org_admin") || rows[0];
        const org = Array.isArray(preferred.organisations) ? preferred.organisations[0] : preferred.organisations;
        const m = await getJson("/api/metrics/connect?org_id=" + org.id + "&period=month");
        if (cancelled) return;
        if (!m.linked) {
          setState({ mode: "demo", reason: org.name + " is not linked to Connect yet — showing sample data" });
          return;
        }
        // Advisories are best-effort: a failure here must not sink the metrics
        // overlay, so it degrades to an empty (all-clear) list.
        let advisories = [];
        try {
          const adv = await getJson("/api/advisory?org_id=" + org.id);
          advisories = (adv && adv.advisories) || [];
        } catch (e) { advisories = []; }
        // Spaces are best-effort too: a failure keeps the demo directory
        // (null), an empty array is a real (honest) empty directory.
        let spaces = null;
        try {
          const sp = await getJson("/api/spaces?org_id=" + org.id);
          spaces = (sp && sp.data) || [];
        } catch (e) { spaces = null; }
        // Cross-pollination is best-effort too (spec §4.2 / mig 155): a null row
        // (unlinked org or fetch failure) leaves the demo/sample discovery card.
        let xpoll = null;
        try {
          const xp = await getJson("/api/metrics/cross-pollination?org_id=" + org.id);
          xpoll = (xp && xp.data) || null;
        } catch (e) { xpoll = null; }
        // Dormancy early-warning is best-effort too (spec §4.5 / mig 156): a null
        // row (unlinked org or fetch failure) drops the dormancy advisory rather
        // than sinking the feed.
        let dormancy = null;
        try {
          const dm = await getJson("/api/metrics/dormancy?org_id=" + org.id);
          dormancy = (dm && dm.data) || null;
        } catch (e) { dormancy = null; }
        if (cancelled) return;
        // Surface the caller's role + id so the Settings Team card can gate
        // admin-only controls and hide self-mutation (spec §3.11 / increment 5).
        D.orgRole = preferred.role || null;
        D.userId = (auth.session && auth.session.user && auth.session.user.id) || null;
        applyOverlay(org, m, advisories, spaces, xpoll, dormancy);
        setState({ mode: "live", reason: "Live Connect metrics for " + org.name });
      })().catch((err) => {
        try { console.warn("[CV_LIVE] falling back to demo data:", err); } catch (e) { /* noop */ }
        if (!cancelled) setState({ mode: "demo", reason: "Live data unavailable — showing sample data" });
      });
      return () => { cancelled = true; };
    }, [auth.status, auth.demo]);

    return state;
  }

  window.CV_LIVE = { useLiveData, applyOverlay };
})();
