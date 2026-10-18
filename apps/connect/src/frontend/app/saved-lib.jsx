// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Save (tracker P2-04): a PRIVATE bookmark for a Contributor or a Place.
//  ------------------------------------------------------------------
//  The data side only, with no React, so a test can feed it a stand-in for the signed-in Supabase client.
//  Table: public.saved_items (migration 183). Row-level security is the wall: a person reads, adds and removes ONLY
//  their own rows, and no policy lets anyone else (the listing, an admin screen, the public key) see them. So the calls
//  below run with the SIGNED-IN client, the same pattern as the follows seed in store.jsx: no API route in between.
//  An Event is not saved here: its bookmark is Consider (a state of its rsvps row).
//
//  Public surface: window.CCSaved = { MAX, column, load, add, remove }.
// ════════════════════════════════════════════════════════════════════
(function () {
  const TABLE = 'saved_items';
  const MAX = 500;      // the database ceiling (trigger saved_items_cap); shown to the person when it is reached
  const column = (kind) => (kind === 'place' ? 'place_id' : 'contributor_id');

  /** Every saved id of the signed-in person: { contributors: Set, places: Set }. Throws when the read fails. */
  async function load(sb, userId) {
    const { data, error } = await sb.from(TABLE).select('contributor_id,place_id').eq('user_id', userId);
    if (error) throw error;
    const contributors = new Set();
    const places = new Set();
    (data || []).forEach((r) => {
      if (r.contributor_id) contributors.add(r.contributor_id);
      else if (r.place_id) places.add(r.place_id);
    });
    return { contributors, places };
  }

  /** Save one listing. Resolves 'saved', 'already' (it was saved before: success), or 'limit' (500 reached). Throws otherwise. */
  async function add(sb, userId, kind, id) {
    const { error } = await sb.from(TABLE).insert({ user_id: userId, [column(kind)]: id });
    if (!error) return 'saved';
    if (error.code === '23505') return 'already';
    if (error.code === 'P0001' && String(error.message || '').indexOf('saved_items_limit') !== -1) return 'limit';
    throw error;
  }

  /** Remove one save. Removing what is not there is success. Throws when the call fails. */
  async function remove(sb, userId, kind, id) {
    const { error } = await sb.from(TABLE).delete().eq('user_id', userId).eq(column(kind), id);
    if (error) throw error;
  }

  window.CCSaved = { MAX, column, load, add, remove };
})();
