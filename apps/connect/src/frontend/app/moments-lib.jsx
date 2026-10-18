// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Moments (tracker P2-05, ADAPTED; migration 188): a short note that clears itself after a day.
//  ------------------------------------------------------------------
//  The data side only, with no React, so a test can feed it a stand-in for the signed-in Supabase client.
//  Table: public.moments. Row-level security is the wall: anyone reads a LIVE note, only an approved Contributor posts
//  one as themselves, only the author (or an admin) takes one down, and nobody can edit one. So the calls below run with
//  the SIGNED-IN client, the same pattern as saved-lib.jsx: no API route in between. The public READ comes with the
//  Contributor's own page data (GET /api/v1/contributors/<slug> -> data.moments), not from here.
//
//  What a Moment is NOT (tracker Q4, the attention test): no unseen ring, no countdown, no view count, no notification.
//  Nothing in this file records who has seen a note.
//
//  Public surface: window.CCMoments = { MAX_CHARS, MAX_LIVE, clean, size, check, live, listMine, post, takeDown }.
// ════════════════════════════════════════════════════════════════════
(function () {
  const TABLE = 'moments';
  const COLS = 'id,body,image_url,created_at,expires_at';
  const MAX_CHARS = 280;     // the database check (char_length between 1 and 280)
  const MAX_LIVE = 5;        // the database trigger moments_cap
  const MAX_URL = 500;       // the database check on image_url

  /** Line breaks kept, other control characters turned into spaces, the ends trimmed. */
  function clean(text) {
    return String(text == null ? '' : text)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .trim();
  }
  /** Characters the way the database counts them (a code point, so an emoji is one). */
  function size(text) { return Array.from(String(text == null ? '' : text)).length; }
  /** 'ok' | 'empty' | 'too_long' for what the person typed, after cleaning. */
  function check(text) {
    const n = size(clean(text));
    if (n < 1) return 'empty';
    return n > MAX_CHARS ? 'too_long' : 'ok';
  }
  /** The notes that have not ended yet (a cached page can be a few minutes old), newest first, at most MAX_LIVE. */
  function live(list, nowMs) {
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    return (Array.isArray(list) ? list : [])
      .filter((m) => m && m.id && typeof m.body === 'string' && m.body && Date.parse(m.expires_at) > now)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, MAX_LIVE);
  }

  /** The signed-in Contributor's own live notes, newest first. Throws when the read fails. */
  async function listMine(sb, userId, nowIso) {
    const { data, error } = await sb.from(TABLE).select(COLS).eq('contributor_id', userId)
      .gt('expires_at', nowIso || new Date().toISOString()).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /**
   * Post one note as the signed-in Contributor. Resolves { status: 'posted', moment } | { status: 'empty' | 'too_long' }
   * (nothing was sent) | { status: 'limit' } (5 are already live) | { status: 'not_allowed' } (not an approved Contributor).
   * Throws on any other failure. The expiry is the database's: it sets it, the caller never can.
   */
  async function post(sb, userId, text, imageUrl) {
    const verdict = check(text);
    if (verdict !== 'ok') return { status: verdict };
    const image = typeof imageUrl === 'string' && imageUrl && imageUrl.length <= MAX_URL ? imageUrl : null;
    const { data, error } = await sb.from(TABLE).insert({ contributor_id: userId, body: clean(text), image_url: image }).select(COLS).single();
    if (!error) return { status: 'posted', moment: data };
    if (error.code === 'P0001' && String(error.message || '').indexOf('moments_limit') !== -1) return { status: 'limit' };
    if (error.code === '42501') return { status: 'not_allowed' };
    throw error;
  }

  /** Take one note down. Taking down what is already gone is success. Throws when the call fails. */
  async function takeDown(sb, id) {
    const { error } = await sb.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }

  window.CCMoments = { MAX_CHARS, MAX_LIVE, clean, size, check, live, listMine, post, takeDown };
})();
