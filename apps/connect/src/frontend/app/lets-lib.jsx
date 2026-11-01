// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — "Let's…" gatherings (issue #313, stages 1 and 2)
//  ------------------------------------------------------------------
//  Eight starters. Each one presets an existing event category and marks
//  the row lets_starter. A citizen may create 4 of those per rolling
//  window (migration 202). Ordinary community events keep their own cap
//  (migration 037, default 1 per 30 days) and Let's rows are not counted
//  in it. Stage 3 (a generated daily "I'm in") is not here. Labels are
//  data, the same way category names are data.
//
//  communityInsertBlocked and letsUpdateBlocked mirror
//  events_enforce_community_rate_limit after migration 202.
//  recentNonLets is ordinary community events in the window.
//  recentLets is Let's rows in the window. A non-admin cannot change
//  the marker or the category of a Let's row.
// ════════════════════════════════════════════════════════════════════
(function () {
  const STARTERS = [
    { id: 'evangelise', label: "Let's Evangelise", category: 'outreach-missions', icon: 'Megaphone' },
    { id: 'run', label: "Let's Run", category: 'sport-recreation', icon: 'Footprints' },
    { id: 'pray', label: "Let's Pray", category: 'worship-prayer', icon: 'HeartHandshake' },
    { id: 'worship', label: "Let's Worship", category: 'worship-prayer', icon: 'Music' },
    { id: 'social', label: "Let's Social", category: 'social-gatherings', icon: 'Users' },
    { id: 'clean-up', label: "Let's Clean-Up", category: 'community-upliftment', icon: 'Sparkles' },
    { id: 'coffee', label: "Let's Coffee", category: 'social-gatherings', icon: 'Coffee' },
    { id: 'flashmob', label: "Let's FlashMob", category: 'arts-culture', icon: 'Flame' },
  ];

  function starterById(id) {
    if (typeof id !== 'string' || !id) return null;
    for (let i = 0; i < STARTERS.length; i++) {
      if (STARTERS[i].id === id) return STARTERS[i];
    }
    return null;
  }

  const LETS_CAP = 4;

  /**
   * True when this insert must be refused.
   * A citizen with a known starter is refused once recentLets is at 4.
   * A citizen without one is refused once recentNonLets is at the ordinary cap (default 1).
   * Contributors and admins are never refused. An unknown marker is not a Let's row.
   */
  function communityInsertBlocked(input) {
    const row = input || {};
    if (row.role !== 'citizen') return false;
    if (starterById(row.letsStarter)) {
      const letsLimit = Number.isFinite(row.letsLimit) && row.letsLimit >= 1 ? row.letsLimit : LETS_CAP;
      const recentLets = Number.isFinite(row.recentLets) && row.recentLets > 0 ? row.recentLets : 0;
      return recentLets >= letsLimit;
    }
    const limit = Number.isFinite(row.limit) && row.limit >= 1 ? row.limit : 1;
    const recent = Number.isFinite(row.recentNonLets) && row.recentNonLets > 0 ? row.recentNonLets : 0;
    return recent >= limit;
  }

  /**
   * True when a non-admin update must be refused. The marker cannot change.
   * On a Let's row the category cannot change either. Title and description are not looked at.
   */
  function letsUpdateBlocked(input) {
    const row = input || {};
    if (row.actor === 'admin' || row.actor === 'service_role') return false;
    const nextMarker = Object.prototype.hasOwnProperty.call(row, 'nextLetsStarter') ? row.nextLetsStarter : row.letsStarter;
    if ((nextMarker || '') !== (row.letsStarter || '')) return true;
    if (starterById(row.letsStarter) && row.nextCategory != null && row.nextCategory !== row.category) return true;
    return false;
  }

  function upcomingLets(events, now) {
    const data = window.DATA || {};
    const listed = data.publicRows ? data.publicRows(events) : (events || []).filter(Boolean);
    const past = data.isPastEvent || function () { return false; };
    const when = now == null ? Date.now() : now;
    const out = [];
    for (let i = 0; i < listed.length; i++) {
      const e = listed[i];
      if (e && starterById(e.letsStarter) && !past(e, when)) out.push(e);
    }
    return out;
  }

  function fromApiRow(r) {
    if (!r || !starterById(r.lets_starter)) return null;
    const start = r.date ? new Date(r.date) : null;
    const valid = start && !isNaN(start.getTime());
    return {
      id: r.id,
      title: r.title || 'Untitled event',
      category: r.category || '',
      letsStarter: r.lets_starter,
      location: r.location || '',
      startsAt: valid ? start.toISOString() : '',
      endsAt: r.end_time || '',
      date: valid ? start.toISOString().slice(0, 10) : '',
      status: 'published',
      visibility: 'public',
    };
  }

  function bySoonest(a, b) {
    const ta = Date.parse((a && (a.startsAt || a.date)) || '') || 0;
    const tb = Date.parse((b && (b.startsAt || b.date)) || '') || 0;
    if (ta !== tb) return ta - tb;
    return String((a && a.title) || '').localeCompare(String((b && b.title) || ''));
  }

  /** Remote rows (the lets=1 feed) win on id. Local rows the feed has not returned yet stay. */
  function mergeActivities(local, remote) {
    const map = new Map();
    (local || []).forEach((e) => { if (e && e.id) map.set(e.id, e); });
    (remote || []).forEach((e) => { if (e && e.id) map.set(e.id, e); });
    return Array.from(map.values()).sort(bySoonest);
  }

  function letsFeedPath(now) {
    const data = window.DATA;
    const base = data && data.eventsFeedPath ? data.eventsFeedPath(now) : '/api/v1/events?limit=100';
    if (base.indexOf('lets=1') !== -1) return base;
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'lets=1';
  }

  window.LETS = {
    STARTERS: STARTERS,
    starterById: starterById,
    LETS_CAP: LETS_CAP,
    communityInsertBlocked: communityInsertBlocked,
    letsUpdateBlocked: letsUpdateBlocked,
    upcomingLets: upcomingLets,
    fromApiRow: fromApiRow,
    mergeActivities: mergeActivities,
    letsFeedPath: letsFeedPath,
  };
})();
