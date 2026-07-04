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
      neutral: "All contributors are active.",
      source: "dormancy early-warning (§4.5)",
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

  const activities = [
    { id: "act-1", title: "Community Food Drive", space: "Community Projects", date: "2026-06-28", reach: 218, engagement: 72, rating: 4.7, claimed: true },
    { id: "act-2", title: "Youth Mentorship intro night", space: "Outreach", date: "2026-06-21", reach: 94, engagement: 61, rating: 4.5, claimed: true },
    { id: "act-3", title: "Soup Kitchen — Saturday shift", space: "Volunteers", date: "2026-06-20", reach: 42, engagement: 55, rating: 4.8, claimed: false },
    { id: "act-4", title: "Winter Blanket Drive wrap-up", space: "Fundraising", date: "2026-06-14", reach: 152, engagement: 48, rating: 4.2, claimed: true },
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
  const partnerships = [ // §3.8 org_partnerships + shared_metrics
    { org: "Grace Fellowship", status: "active", sharing: "summary", metrics: ["reach", "events"] },
    { org: "City Shelter Trust", status: "pending", sharing: "none", metrics: [] },
  ];

  window.CV_DATA = {
    fill,
    narrativeTemplates,
    org: { name: "Hope Collective", type: "charity", health: 78, healthTrend: [72, 74, 73, 76, 77, 78] },
    pulse: [
      { label: "People reached", value: "476", delta: "+22%", tone: "good" },
      { label: "Active volunteers", value: "24", delta: "-29%", tone: "bad" },
      { label: "Engagement score", value: "64", delta: "+6", tone: "good" },
      { label: "Goal alignment", value: "58%", delta: "-3", tone: "warn" },
    ],
    observations, advisories, spaces, activities, analytics, coverage,
    goalsList, projectsList, visionList, team, partnerships,
    orgTypes: ["church", "charity", "business", "ministry", "education", "marketplace"],
    priorities: ["Community reach", "Volunteer retention", "Donor growth", "Event quality", "Geographic coverage"],
  };
})();
