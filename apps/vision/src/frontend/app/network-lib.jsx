// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — Community Network Graph helpers (pure; window.CV_NETWORK)
//  ------------------------------------------------------------------
//  The reader (migration 182, GET /api/metrics/shared-audience) returns
//  ORGANISATIONS and COUNTS only: who shares your audience, and how many
//  citizens they share. This file turns those rows into what the screen draws
//  (a star around your organisation: closer and thicker = more shared) and the
//  sentence under it. No DOM, no React: a unit test runs it directly — see
//  src/__tests__/frontend/networkLib.test.ts.
//
//  Privacy is the reader's job (it never returns a pair under 3 shared
//  citizens, and never a hidden or unapproved Contributor); MIN_SHARED here is
//  the same floor applied again, so a bad row can never be drawn.
// ════════════════════════════════════════════════════════════════════
(() => {
  const MIN_SHARED = 3;

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // pg `numeric` arrives as a string; counts as numbers. Rows under the floor, or
  // without an id, are dropped. Sorted strongest first, name as the tie-break.
  function mapRows(rows) {
    const out = [];
    (rows || []).forEach((r) => {
      if (!r || !r.other_id) return;
      const shared = Math.round(num(r.shared_count));
      if (shared < MIN_SHARED) return;
      out.push({
        id: String(r.other_id),
        name: String(r.other_name || "Organisation"),
        logo: r.other_logo_url ? String(r.other_logo_url) : "",
        shared,
        mine: Math.round(num(r.my_audience)),
        theirs: Math.max(shared, Math.round(num(r.other_audience))),
        pctMine: r.shared_pct_of_mine === null || r.shared_pct_of_mine === undefined ? null : num(r.shared_pct_of_mine),
        pctTheirs: r.shared_pct_of_other === null || r.shared_pct_of_other === undefined ? null : num(r.shared_pct_of_other),
      });
    });
    return out.sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name));
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function clip(text, max) {
    const s = String(text || "");
    return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
  }

  const plural = (n, one, many) => (n === 1 ? one : many);
  const fmtPct = (p) => (p === null || p === undefined ? "—" : (Math.round(p * 10) / 10).toString() + "%");

  // A star layout in a width x height box, centred on (0, 0): your organisation in
  // the middle, the others spread evenly round it clockwise from the top,
  // strongest first. DISTANCE falls as shared rises (more shared = closer), edge
  // WIDTH rises with it, and a node's SIZE follows the size of its own audience.
  function layout(nodes, box) {
    const width = (box && box.width) || 720;
    const height = (box && box.height) || 460;
    const list = nodes || [];
    const center = { x: 0, y: 0, r: 34 };
    if (list.length === 0) return { center, nodes: [], edges: [], width, height };
    const maxShared = Math.max.apply(null, list.map((n) => n.shared));
    const maxTheirs = Math.max.apply(null, list.map((n) => n.theirs));
    // Leave room for the biggest node and its label inside the box.
    const dMax = Math.max(90, Math.min(width, height) / 2 - 56);
    const dMin = Math.min(dMax - 20, 96);
    const placed = list.map((n, i) => {
      const strength = maxShared > 0 ? n.shared / maxShared : 0; // 0..1
      const dist = dMax - strength * (dMax - dMin);
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / list.length;
      const r = 12 + 16 * Math.sqrt(maxTheirs > 0 ? n.theirs / maxTheirs : 0);
      return {
        id: n.id, name: n.name, logo: n.logo, shared: n.shared,
        x: Math.round(Math.cos(angle) * dist * 10) / 10,
        y: Math.round(Math.sin(angle) * dist * 10) / 10,
        r: Math.round(r * 10) / 10,
        strength,
      };
    });
    const edges = placed.map((p) => ({ id: p.id, w: Math.round((1.5 + 6 * p.strength) * 10) / 10 }));
    return { center, nodes: placed, edges, width, height };
  }

  // The sentence for one organisation (counts beside percentages, never a bare %).
  function describe(node, myName) {
    const me = myName || "Your organisation";
    const people = plural(node.shared, "community member", "community members");
    const share = node.mine > 0 ? " That is " + node.shared + " of your " + node.mine + " (" + fmtPct(node.pctMine) + ")." : "";
    const them = node.theirs > 0 ? " It is " + node.shared + " of their " + node.theirs + " (" + fmtPct(node.pctTheirs) + ")." : "";
    return me + " and " + node.name + " share " + node.shared + " " + people + "." + share + them;
  }

  // The honest one-liner for the whole screen.
  function headline(nodes, days) {
    const n = (nodes || []).length;
    if (n === 0) return "No organisation shares " + MIN_SHARED + " or more of your community members yet.";
    return n + " " + plural(n, "organisation shares", "organisations share") + " community members with you over the last " + days + " days.";
  }

  window.CV_NETWORK = { MIN_SHARED, mapRows, initials, clip, layout, describe, headline, fmtPct };
})();
