// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Convince (FEAT-04): the data side of "Friends considering".
//  ------------------------------------------------------------------
//  No React, so a test can feed it a stand-in for the signed-in Supabase client and for fetch. Two doors, both already guarded by the
//  database, and this file only asks politely and turns every answer into plain words:
//    friends_considering_event(p_event)   the caller's mutual, unblocked friends who are considering ONE upcoming event and have not
//                                         hidden it (id, full_name, avatar_url, nudged). Read with the signed-in client.
//    POST / DELETE /api/convince          send or withdraw a nudge; the INSERT policy decides who may be nudged (the same rule the
//                                         reader uses, so the list and the policy cannot disagree).
//  A refusal is NEVER explained: a block, a friend who hid "considering" and a friend who is not considering all read as the same
//  neutral sentence, because the reason would reveal exactly what those people chose to keep private.
//
//  Public surface: window.CCConvince = { MAX_FRIENDS, COPY, nameOf, previewLine, eligibleEvent, friendsConsidering, send, withdraw }.
// ════════════════════════════════════════════════════════════════════
(function () {
  const MAX_FRIENDS = 50;   // the database's own cap
  const GENERIC = 'Something went wrong. Please try again.';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // The words, in one place. Calm, short, never naming the reason for a refusal.
  const COPY = {
    title: 'Friends considering',
    sub: 'These friends are thinking about going. A gentle nudge might be the encouragement they need.',
    nudge: 'Nudge',
    nudged: 'Nudged',
    undo: 'Undo',
    sent: (name) => 'Nudge sent to ' + name + '.',
    already: (name) => 'You have already nudged ' + name + ' about this event.',
    withdrawn: 'Nudge withdrawn. Anything they already saw stays in their notifications.',
    refused: 'That nudge cannot be sent right now.',
    slowDown: 'That is a lot of nudges at once. Please try again in a moment.',
    signIn: 'Please sign in first.',
    generic: GENERIC,
    shareNote: 'Friends you follow, who follow you back, can see you’re considering this.',
    shareNoteLink: 'Change in Settings',
    shareLabel: 'Friends can see what I’m considering',
    shareDesc: 'Friends you follow, who follow you back, can see when you tap Consider on an event, so they can give you a gentle nudge. Turn this off to keep it to yourself.',
  };

  /** A friend's name for display: their profile name, or a plain word when they have none (an email sign-up starts blank). */
  const nameOf = (friend) => {
    const n = friend && typeof friend.name === 'string' ? friend.name.trim() : '';
    return n || 'A friend';
  };

  /** The line a friend will read in their notifications, so the sender knows what is being sent. The sender with no name reads as Someone. */
  const previewLine = (senderName, eventTitle) => {
    const who = typeof senderName === 'string' && senderName.trim() ? senderName.trim() : 'Someone';
    return who + ' thinks you should go to ' + String(eventTitle || 'this event');
  };

  /** Can a nudge even be possible for this app-shaped event? A real (UUID) event that is not cancelled and not over. */
  const eligibleEvent = (ev) => {
    if (!ev || typeof ev.id !== 'string' || !UUID_RE.test(ev.id)) return false;
    if (ev.status === 'cancelled') return false;
    const past = window.DATA && typeof window.DATA.isPastEvent === 'function' ? window.DATA.isPastEvent(ev) : false;
    return !past;
  };

  /**
   * The friends who are considering this event. Resolves { ok, friends: [{ id, name, photo, nudged }] }.
   * Anything that goes wrong (no client, a junk id, the function missing, the network) is { ok: false, friends: [] }: the row is an
   * optional extra on the event screen, so it stays out of the way instead of showing an error nobody can act on.
   */
  async function friendsConsidering(sb, eventId) {
    if (!sb || typeof eventId !== 'string' || !UUID_RE.test(eventId)) return { ok: false, friends: [] };
    try {
      const { data, error } = await sb.rpc('friends_considering_event', { p_event: eventId });
      if (error || !Array.isArray(data)) return { ok: false, friends: [] };
      const friends = data
        .filter((r) => r && typeof r.id === 'string' && UUID_RE.test(r.id))
        .slice(0, MAX_FRIENDS)
        .map((r) => ({
          id: r.id,
          name: typeof r.full_name === 'string' ? r.full_name.trim() : '',
          photo: typeof r.avatar_url === 'string' && /^https?:\/\//i.test(r.avatar_url) ? r.avatar_url : '',
          nudged: r.nudged === true,
        }));
      return { ok: true, friends };
    } catch (e) {
      return { ok: false, friends: [] };
    }
  }

  async function call(fetcher, method, eventId, toUserId) {
    if (typeof fetcher !== 'function') return null;
    try {
      return await fetcher('/api/convince', { method, body: JSON.stringify({ event_id: eventId, to_user_id: toUserId }) });
    } catch (e) {
      return null;
    }
  }

  /**
   * Send a nudge. Resolves { ok: true, state: 'sent' | 'already' } or { ok: false, reason, message }.
   * 201 sent; 409 already nudged (still a good state: the screen shows Nudged); 403 refused (neutral, whatever the cause);
   * 429 slow down; 401 signed out; anything else (or no answer) the generic sentence. The server's own wording is never shown.
   */
  async function send(fetcher, eventId, toUserId) {
    const res = await call(fetcher, 'POST', eventId, toUserId);
    if (!res) return { ok: false, reason: 'network', message: GENERIC };
    if (res.status === 201 || res.status === 200) return { ok: true, state: 'sent' };
    if (res.status === 409) return { ok: true, state: 'already' };
    if (res.status === 403) return { ok: false, reason: 'refused', message: COPY.refused };
    if (res.status === 429) return { ok: false, reason: 'rate_limited', message: COPY.slowDown };
    if (res.status === 401) return { ok: false, reason: 'signed_out', message: COPY.signIn };
    return { ok: false, reason: 'error', message: GENERIC };
  }

  /** Withdraw a nudge. Resolves { ok: true } or { ok: false, reason, message }. */
  async function withdraw(fetcher, eventId, toUserId) {
    const res = await call(fetcher, 'DELETE', eventId, toUserId);
    if (!res) return { ok: false, reason: 'network', message: GENERIC };
    if (res.status === 200) return { ok: true };
    if (res.status === 429) return { ok: false, reason: 'rate_limited', message: COPY.slowDown };
    if (res.status === 401) return { ok: false, reason: 'signed_out', message: COPY.signIn };
    return { ok: false, reason: 'error', message: GENERIC };
  }

  window.CCConvince = { MAX_FRIENDS, COPY, nameOf, previewLine, eligibleEvent, friendsConsidering, send, withdraw };
})();
