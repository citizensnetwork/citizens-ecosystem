// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — data + THE NARRATIVE ENGINE (build plan §4 ⭐)
//  ------------------------------------------------------------------
//  Vision must report autonomously through calculation + string
//  manipulation + table queries — NOT live LLM generation. All insight
//  copy is authored as templated strings with named data slots; when the
//  backend calc functions land (VISION_BACKEND_WIRING_SPEC), their rows
//  drop straight into the slots. The `data` objects below ARE the
//  contract with the backend — their keys are the calc outputs.
//  Demo org: "Hope Collective" (charity). Exposes window.CV_DATA.
// ════════════════════════════════════════════════════════════════════
(() => {
  // fill('Retention fell to {pct} ({ret}/{prev}).', {pct:'71%',ret:24,prev:34})
  // Missing slots degrade to an em dash so the sentence still parses
  // (authoring rule 4 — graceful degradation).
  function fill(template, data) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) =>
      data && data[key] !== undefined && data[key] !== null ? String(data[key]) : "—"
    );
  }

  // Template catalog keyed by insight type — mirrors
  // vision.advisory_templates.title_template/body_template so the rule
  // engine (evaluate_advisory_rules) can select by metric_slug + severity
  // and hand a data row over. Every number/entity is a slot; percentage
  // always pairs with count (Display Convention #8).
  const narrativeTemplates = {
    reach: {
      title: "Reach {trendVerb} to {current}",
      body: "{current} people were reached this {period}, {deltaPct} vs {prev}. {topContributor} drove most of it.",
      // Variant while per-event attribution (spec §3.4a breakdowns) is unbuilt.
      bodyNoAttribution: "{current} people were reached this {period}, {deltaPct} vs {prev}, across {events} events.",
      neutral: "Reach is steady at {current} this {period}.",
      source: "reach_per_org + calendar_growth",
    },
    growth: {
      title: "{metric} growth is {state}",
      body: "{metric} moved {deltaPct} ({current} vs {prev}) {period}-over-{period}.",
      neutral: "{metric} is holding steady at {current}.",
      source: "calendar_growth / series_growth",
    },
    retention: {
      title: "{subject} retention is {state}",
      body: "{pct} of last {period}'s people returned ({ret}/{prev}); {churned} did not. Churn concentrates in {hotspot}.",
      // Variant while per-Space churn hotspots (spec §3.4c + spaces) are unbuilt.
      bodyNoHotspot: "{pct} of last {period}'s people returned ({ret}/{prev}); {churned} did not.",
      neutral: "{subject} retention is steady.",
      source: "retention_rate",
    },
    engagement: {
      title: "Engagement is {state} at {score}",
      body: "Weighted engagement is {score}/100, {deltaPct} {period}-over-{period}, led by {topComponent}.",
      neutral: "Engagement is steady at {score}/100.",
      source: "engagement_per_org",
    },
    funnel: {
      title: "{convPct} of viewers {action}",
      body: "Of {impressions} impressions, {considering} considered, {attending} attended, {reviews} reviewed, {follows} followed.",
      neutral: "The journey funnel is stable this {period}.",
      source: "activity_funnel",
    },
    broadcast: {
      title: "Broadcasts converted at {convPct}",
      body: "{sent} broadcasts reached {audience}; {rsvps} RSVPs and {follows} follows landed within 48h.",
      neutral: "No broadcasts were sent this {period}.",
      source: "broadcast_effectiveness",
    },
    alignment: {
      title: "Org alignment is {state} at {score}",
      body: "Priority-weighted alignment across {goalCount} active goals is {score}. {weakGoal} is the weakest link.",
      neutral: "Alignment is steady at {score}.",
      source: "compute_org_alignment",
    },
    dormancy: {
      title: "{count} contributors have gone quiet",
      body: "{count} contributors haven't posted in {days}+ days — {names}.",
      // Variant when the dormant contributors' public names can't be resolved
      // (Connect directory unreachable) — the count + threshold still tell the
      // honest story (authoring rule 4 — graceful degradation).
      bodyNoNames: "{count} organisations your community engages with haven't posted in {days}+ days ({count} of {orbit} in your orbit).",
      neutral: "All contributors are active.",
      source: "dormancy early-warning (§4.5)",
    },
    // De-scattering the Body (§4.2) — the platform's most VISION-central signal:
    // are your engaged citizens discovering organisations they'd never met before?
    crossPollination: {
      title: "{citizensDiscovering} citizens discovered new organisations",
      body: "{citizensDiscovering} of {audienceSize} engaged citizens ({discoveryPct}) connected with an organisation they'd never engaged with before — {newConnections} new connections across {distinctNewOrgs} organisations in the last {windowDays} days.",
      neutral: "No new-organisation discoveries recorded in the last {windowDays} days.",
      source: "cross_pollination (§4.2)",
    },
  };

  // Observations: {type, severity, data} — NEVER finished prose. The UI
  // renders fill(template, data); raw values feed the Raw Data tab from
  // the same object (five-layer law: Conclusions→Contributions→Evidence→
  // Charts→Raw).
  const observations = [
    {
      id: "obs-1", type: "retention", severity: "warning",
      data: {
        subject: "Volunteer", state: "declining", pct: "71%", ret: 24, prev: 34,
        churned: 10, period: "month", hotspot: "Soup Kitchen shifts",
      },
      contributions: [
        { label: "Soup Kitchen shifts", detail: "6 of 10 churned volunteers last served here" },
        { label: "Winter Drive wrap-up", detail: "seasonal volunteers not re-engaged" },
      ],
      chart: [34, 33, 31, 30, 27, 24],
    },
    {
      id: "obs-2", type: "reach", severity: "good",
      data: {
        current: 476, prev: 391, deltaPct: "+22%", period: "month",
        trendVerb: "climbed", topContributor: "Community Food Drive",
      },
      contributions: [
        { label: "Community Food Drive", detail: "218 of the 476 reached" },
        { label: "Youth Mentorship intro night", detail: "94 first-time visitors" },
      ],
      chart: [310, 342, 335, 391, 428, 476],
    },
    {
      id: "obs-3", type: "engagement", severity: "info",
      data: {
        state: "improving", score: 64, deltaPct: "+6", period: "month",
        topComponent: "RSVPs",
      },
      contributions: [
        { label: "RSVPs", detail: "38% of the weighted score" },
        { label: "Reviews", detail: "avg 4.6★ across 31 reviews" },
      ],
      chart: [51, 54, 53, 58, 60, 64],
    },
    {
      id: "obs-4", type: "alignment", severity: "warning",
      data: { state: "at risk", score: "58%", goalCount: 4, weakGoal: "Grow monthly donors" },
      contributions: [
        { label: "Grow monthly donors", detail: "12% progress against a 40% expected pace" },
      ],
      chart: [70, 68, 64, 61, 59, 58],
    },
    {
      id: "obs-5", type: "crossPollination", severity: "good",
      data: {
        citizensDiscovering: 45, audienceSize: 118, discoveryPct: "38% (45/118)",
        newConnections: 62, distinctNewOrgs: 14, windowDays: 90,
        avgPerCitizen: "0.53 orgs/citizen",
      },
      contributions: [
        { label: "Community Food Drive", detail: "introduced 28 citizens to 9 other organisations" },
        { label: "Youth Mentorship intro night", detail: "17 first-time cross-org connections" },
      ],
      chart: [7, 9, 11, 10, 13, 14],
    },
  ];

  // Advisories: same {template,data} shape, driven by rules — spec §3.7.
  const advisories = [
    {
      id: "adv-1", type: "dormancy", severity: "warning",
      data: { count: 3, days: 30, names: "J. Mokoena, T. van Wyk, P. Dlamini" },
    },
    {
      id: "adv-2", type: "broadcast", severity: "info",
      data: { convPct: "9%", sent: 4, audience: 320, rsvps: 21, follows: 8 },
    },
  ];

  const spaces = [
    { id: "sp-1", name: "Community Projects", icon: "grid", color: "var(--info)", activities: 12, people: 86, reach: 476, trend: [8, 9, 12, 11, 12, 14] },
    { id: "sp-2", name: "Volunteers", icon: "users", color: "var(--success)", activities: 9, people: 34, reach: 210, trend: [10, 9, 9, 8, 8, 9] },
    { id: "sp-3", name: "Outreach", icon: "map", color: "var(--gold-600)", activities: 6, people: 41, reach: 388, trend: [3, 4, 4, 5, 6, 6] },
    { id: "sp-4", name: "Fundraising", icon: "target", color: "var(--admin)", activities: 4, people: 18, reach: 152, trend: [2, 2, 3, 3, 4, 4] },
    { id: "sp-5", name: "Events", icon: "calendar", color: "var(--danger)", activities: 15, people: 120, reach: 610, trend: [11, 12, 12, 14, 15, 15] },
  ];

  // mapId links each demo activity to its twin in mapActivities below (same title), so the
  // Activities screen shows the place the Timeline Map already plots and an edit moves one dot.
  const activities = [
    { id: "act-1", mapId: "ma-1", title: "Community Food Drive", space: "Community Projects", date: "2026-06-28", reach: 218, engagement: 72, rating: 4.7, claimed: true },
    { id: "act-2", mapId: "ma-2", title: "Youth Mentorship intro night", space: "Outreach", date: "2026-06-21", reach: 94, engagement: 61, rating: 4.5, claimed: true },
    { id: "act-3", mapId: "ma-3", title: "Soup Kitchen — Saturday shift", space: "Volunteers", date: "2026-06-20", reach: 42, engagement: 55, rating: 4.8, claimed: false },
    { id: "act-4", mapId: "ma-4", title: "Winter Blanket Drive wrap-up", space: "Fundraising", date: "2026-06-14", reach: 152, engagement: 48, rating: 4.2, claimed: true },
  ];

  // Analytics series (metric → conclusion narrative + series + evidence).
  // Wiring targets in comments = VISION_BACKEND_WIRING_SPEC sections.
  const analytics = {
    reach: { // §3.4a reach_per_event/org/space
      type: "reach", series: [310, 342, 335, 391, 428, 476],
      data: observations[1].data,
      evidence: [["Reached this month", "476"], ["Previous month", "391"], ["Delta", "+22% (85)"]],
    },
    growth: { // §3.4b calendar_growth / series_growth / vision_period_snapshots
      type: "growth", series: [12, 14, 13, 17, 19, 22],
      data: { metric: "Followers", state: "accelerating", deltaPct: "+16%", current: 22, prev: 19, period: "month" },
      evidence: [["New followers", "22"], ["Previous month", "19"], ["Delta", "+16% (3)"]],
    },
    retention: { // §3.4c retention_rate
      type: "retention", series: [34, 33, 31, 30, 27, 24],
      data: observations[0].data,
      evidence: [["Returned", "24/34"], ["Rate", "71%"], ["Churned", "10"]],
    },
    funnel: { // §3.4a/4.1 activity_funnel — Impression→Consider→Attend→Review→Follow
      type: "funnel", series: [1240, 380, 152, 31, 18],
      stages: ["Impressions", "Considering", "Attending", "Reviewed", "Followed"],
      data: { convPct: "12%", action: "attended", impressions: 1240, considering: 380, attending: 152, reviews: 31, follows: 18, period: "month" },
      evidence: [["Impression → Attend", "12% (152/1240)"], ["Attend → Review", "20% (31/152)"], ["Review → Follow", "58% (18/31)"]],
    },
    engagement: { // §3.4d engagement_per_event/org — 6-component weighted score
      type: "engagement", series: [51, 54, 53, 58, 60, 64],
      data: observations[2].data,
      evidence: [["Weighted score", "64/100"], ["Top component", "RSVPs (38%)"], ["Reviews", "4.6★ / 31"]],
    },
    broadcast: { // §3.4d/§4 broadcast_effectiveness — conversions within 48h
      type: "broadcast", series: [6, 11, 4, 9, 14, 21],
      data: advisories[1].data,
      evidence: [["Broadcasts sent", "4"], ["Audience", "320"], ["48h RSVPs", "21 (7%)"], ["48h follows", "8 (3%)"]],
    },
  };

  const coverage = [ // §3.6 geo_boundaries + mv_boundary_activity_coverage
    { boundary: "Pretoria Central", level: "well-covered", activities: 14, pct: 42 },
    { boundary: "Mamelodi", level: "moderate", activities: 7, pct: 21 },
    { boundary: "Soshanguve", level: "low", activities: 3, pct: 9 },
    { boundary: "Centurion", level: "gap", activities: 0, pct: 0 },
  ];

  // Editable collections (Goals group — build plan §6): shapes align to the
  // wiring-spec DB columns so live wiring is a swap, not a rewrite.
  const goalsList = [
    { id: "g-1", name: "Reach 600 people monthly", target: 600, current: 476, weight: 30, space: "Events" },
    { id: "g-2", name: "Grow monthly donors", target: 50, current: 12, weight: 25, space: "Fundraising" },
    { id: "g-3", name: "Retain 80% of volunteers", target: 80, current: 71, weight: 25, space: "Volunteers" },
    { id: "g-4", name: "Launch 2 new outreach areas", target: 2, current: 1, weight: 20, space: "Outreach" },
  ];
  const projectsList = [
    { id: "p-1", name: "Winter Warmth 2026", status: "active", milestones: ["Collection points live", "500 blankets", "Distribution weekend"], done: 1, linkedGoal: "Reach 600 people monthly" },
    { id: "p-2", name: "Donor drive relaunch", status: "planning", milestones: ["Story pack", "Pledge page", "Launch event"], done: 0, linkedGoal: "Grow monthly donors" },
  ];
  const visionList = [
    { id: "v-1", text: "Every person in our city knows a place of practical hope.", linkedGoals: 3 },
    { id: "v-2", text: "Volunteers who serve once, stay — because they belong.", linkedGoals: 1 },
  ];

  const team = [ // §3.11 vision.user_org_roles
    { name: "S. Jacobs", role: "org_admin", dept: "Leadership" },
    { name: "M. Botha", role: "org_manager", dept: "Volunteers" },
    { name: "L. Ndlovu", role: "org_member", dept: "Outreach" },
    { name: "R. Pillay", role: "org_viewer", dept: "Board" },
  ];
  // §4.3 Community Network sample: rows in the exact shape of GET
  // /api/metrics/shared-audience (migration 182), so the live response drops in
  // unchanged. Organisations and counts only. Demo only; the live screen never shows these.
  const networkSample = [
    { other_id: "net-1", other_name: "Grace Fellowship", other_logo_url: null, shared_count: 23, my_audience: 120, other_audience: 90, shared_pct_of_mine: "19.2", shared_pct_of_other: "25.6" },
    { other_id: "net-2", other_name: "City Shelter Trust", other_logo_url: null, shared_count: 14, my_audience: 120, other_audience: 60, shared_pct_of_mine: "11.7", shared_pct_of_other: "23.3" },
    { other_id: "net-3", other_name: "Youth for Christ Pretoria", other_logo_url: null, shared_count: 9, my_audience: 120, other_audience: 210, shared_pct_of_mine: "7.5", shared_pct_of_other: "4.3" },
    { other_id: "net-4", other_name: "Hatfield Community Church", other_logo_url: null, shared_count: 6, my_audience: 120, other_audience: 340, shared_pct_of_mine: "5.0", shared_pct_of_other: "1.8" },
    { other_id: "net-5", other_name: "Mamelodi Food Network", other_logo_url: null, shared_count: 4, my_audience: 120, other_audience: 35, shared_pct_of_mine: "3.3", shared_pct_of_other: "11.4" },
  ];
  const partnerships = [ // §3.8 org_partnerships + shared_metrics
    { org: "Grace Fellowship", status: "active", sharing: "summary", metrics: ["reach", "events"] },
    { org: "City Shelter Trust", status: "pending", sharing: "none", metrics: [] },
  ];

  // §3.5 Timeline Map sample: rows in the exact shape of GET /api/map/activities
  // (latitude, longitude, participant_count, location_name, department_name), so
  // the live response drops in unchanged. Demo only; the live map never shows these.
  const mapActivities = [
    { id: "ma-1", title: "Community Food Drive", type: "outreach", date: "2026-06-28", latitude: -25.7118, longitude: 28.3995, location_name: "Mamelodi community hall", participant_count: 218, department_name: "Community Projects" },
    { id: "ma-2", title: "Youth Mentorship intro night", type: "event", date: "2026-06-21", latitude: -25.7487, longitude: 28.238, location_name: "Hatfield", participant_count: 94, department_name: "Outreach" },
    { id: "ma-3", title: "Soup Kitchen — Saturday shift", type: "service", date: "2026-06-20", latitude: -25.7461, longitude: 28.1881, location_name: "Pretoria CBD", participant_count: 42, department_name: "Volunteers" },
    { id: "ma-4", title: "Winter Blanket Drive wrap-up", type: "outreach", date: "2026-06-14", latitude: -25.771, longitude: 28.088, location_name: "Atteridgeville", participant_count: 152, department_name: "Fundraising" },
    { id: "ma-5", title: "Volunteer training day", type: "training", date: "2026-06-07", latitude: -25.8603, longitude: 28.1894, location_name: "Centurion", participant_count: 31, department_name: "Volunteers" },
    { id: "ma-6", title: "Prayer & planning breakfast", type: "meeting", date: "2026-05-30", latitude: -25.7677, longitude: 28.2395, location_name: "Brooklyn", participant_count: 18, department_name: "Leadership" },
    { id: "ma-7", title: "Warm Meals Wednesday", type: "service", date: "2026-05-27", latitude: -25.5351, longitude: 28.1032, location_name: "Soshanguve", participant_count: 76, department_name: "Community Projects" },
    { id: "ma-8", title: "Back-to-school stationery drive", type: "outreach", date: "2026-05-16", latitude: -25.738, longitude: 28.305, location_name: "Silverton", participant_count: 124, department_name: "Fundraising" },
    { id: "ma-9", title: "Skills workshop: CV writing", type: "workshop", date: "2026-05-09", latitude: -25.7907, longitude: 28.2326, location_name: "Waterkloof", participant_count: 27, department_name: "Outreach" },
    { id: "ma-10", title: "Community clean-up morning", type: "event", date: "2026-04-26", latitude: -25.796, longitude: 28.319, location_name: "Garsfontein", participant_count: 58, department_name: "Community Projects" },
    { id: "ma-11", title: "Food parcels packing", type: "service", date: "2026-04-18", latitude: -25.7461, longitude: 28.1881, location_name: "Pretoria CBD", participant_count: 36, department_name: "Volunteers" },
    { id: "ma-12", title: "Easter family gathering", type: "event", date: "2026-04-05", latitude: -25.7118, longitude: 28.3995, location_name: "Mamelodi community hall", participant_count: 164, department_name: "Community Projects" },
  ];

  window.CV_DATA = {
    fill,
    narrativeTemplates,
    mapActivities,
    org: { name: "Hope Collective", type: "charity", health: 78, healthTrend: [72, 74, 73, 76, 77, 78] },
    pulse: [
      { label: "People reached", value: "476", delta: "+22%", tone: "good" },
      { label: "Active volunteers", value: "24", delta: "-29%", tone: "bad" },
      { label: "Engagement score", value: "64", delta: "+6", tone: "good" },
      { label: "Goal alignment", value: "58%", delta: "-3", tone: "warn" },
    ],
    observations, advisories, spaces, activities, analytics, coverage,
    goalsList, projectsList, visionList, team, partnerships, networkSample,
    orgTypes: ["church", "charity", "business", "ministry", "education", "marketplace"],
    priorities: ["Community reach", "Volunteer retention", "Donor growth", "Event quality", "Geographic coverage"],
  };
})();
