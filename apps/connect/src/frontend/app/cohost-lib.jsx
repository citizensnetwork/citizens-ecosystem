// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Co-hosted events (tracker P2-09, migration 184): the data side.
//  ------------------------------------------------------------------
//  No React, so a test can feed it a stand-in for the signed-in Supabase client. The table public.event_cohosts is READ-ONLY
//  for everyone; the only way to change it is one of three SECURITY DEFINER functions, which check who is asking:
//    invite_event_cohost(p_event_id, p_contributor_id)   the organiser invites another approved Contributor (at most 3)
//    respond_event_cohost(p_event_id, p_accept)          only the invited Contributor answers, only while it is open
//    remove_event_cohost(p_event_id, p_contributor_id)   the organiser removes, or a co-host steps off
//  Each returns { success, reason?, status? }; a failed call is an ANSWER, not an exception, so the screen can say why.
//
//  Public surface: window.CCCohosts = { MAX, reasonText, invite, respond, remove, listForEvent, myInvitations, isHostOf }.
// ════════════════════════════════════════════════════════════════════
(function () {
  const MAX = 3;
  const GENERIC = 'Something went wrong. Please try again.';
  // The database's reasons, in plain words. Two are deliberately vague: a hidden or blocked person is never named as such.
  const REASONS = {
    not_authenticated: 'Please sign in first.',
    cannot_cohost_self: 'You are already the host of this event.',
    not_event_owner: 'Only the person who created the event can invite a co-host.',
    not_a_contributor: 'That person is not a Contributor on Citizens Connect.',
    not_allowed: 'That invitation cannot be sent.',
    too_many_cohosts: 'An event can have up to ' + MAX + ' co-hosts.',
    already_invited: 'You have already invited them.',
    no_open_invitation: 'This invitation has already been answered.',
    not_found: 'That co-host is no longer on this event.',
  };
  const reasonText = (reason) => REASONS[reason] || GENERIC;

  async function call(sb, fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    if (error || !data || typeof data !== 'object') return { ok: false, reason: 'error', message: GENERIC };
    return data.success ? { ok: true, status: data.status || null } : { ok: false, reason: data.reason || 'error', message: reasonText(data.reason) };
  }

  /** The organiser invites `contributorId` to co-host `eventId`. Resolves { ok, reason?, message? }. */
  const invite = (sb, eventId, contributorId) => call(sb, 'invite_event_cohost', { p_event_id: eventId, p_contributor_id: contributorId });
  /** The invited Contributor answers: accept = true or false. Resolves { ok, status?: 'accepted' | 'declined', reason?, message? }. */
  const respond = (sb, eventId, accept) => call(sb, 'respond_event_cohost', { p_event_id: eventId, p_accept: !!accept });
  /** The organiser removes a co-host, or a co-host steps off (contributorId is then their own id). */
  const remove = (sb, eventId, contributorId) => call(sb, 'remove_event_cohost', { p_event_id: eventId, p_contributor_id: contributorId });

  /** The co-host rows of one event that the caller may see: the organiser sees every status, anyone else only accepted ones. */
  async function listForEvent(sb, eventId) {
    const { data, error } = await sb.from('event_cohosts').select('contributor_id,status').eq('event_id', eventId);
    if (error) throw error;
    return (data || []).map((r) => ({ contributorId: r.contributor_id, status: r.status }));
  }

  /** Every invitation addressed to the signed-in person: Map of eventId -> 'invited' | 'accepted' | 'declined'. */
  async function myInvitations(sb, userId) {
    const { data, error } = await sb.from('event_cohosts').select('event_id,status').eq('contributor_id', userId);
    if (error) throw error;
    const out = new Map();
    (data || []).forEach((r) => out.set(r.event_id, r.status));
    return out;
  }

  /** Is this Contributor a host of this app-shaped event, as the organiser or as an accepted co-host? */
  const isHostOf = (ev, contributorId) => !!ev && !!contributorId && (ev.organizerId === contributorId || (Array.isArray(ev.coHostIds) && ev.coHostIds.indexOf(contributorId) !== -1));

  window.CCCohosts = { MAX, reasonText, invite, respond, remove, listForEvent, myInvitations, isHostOf };
})();
