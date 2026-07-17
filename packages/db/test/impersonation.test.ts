import { describe, expect, it } from 'vitest';
import { IMPERSONATION_SESSION_TTL_MS, MemoryWearStore, WearStoreError } from '../src/index';
import type { PostWithMedia, WearUser } from '../src/index';

/**
 * Contract tests for mig-163 impersonation Phase 1 (roles MD §7). Each case
 * mirrors a rule of the SECDEF fns — admin-only, reason-gated, one active
 * session per admin AND per target, audit rows written by every read, DM
 * opens carrying their own reason, expiry refusing without closing, and the
 * close notification with the institutional NULL actor. MemoryWearStore is
 * the semantic spec `SupabaseWearStore` must match.
 */

const T0 = '2026-07-17T00:00:00.000Z';

const user = (id: string): WearUser => ({
  id,
  handle: id,
  displayName: id,
  avatarUrl: null,
  createdAt: T0,
  updatedAt: T0,
});

const post = (id: string, authorId: string, atMs: number): PostWithMedia => ({
  post: {
    id,
    authorId,
    brandId: null,
    body: `body of ${id}`,
    createdAt: new Date(atMs).toISOString(),
    updatedAt: new Date(atMs).toISOString(),
    taggedProductIds: [],
    conceptId: null,
  },
  media: [],
});

/**
 * admin usr_a · second admin usr_a2 · target usr_t (follows usr_o) ·
 * bystander usr_o (2 posts) · target has 1 own post; a DM (usr_t ↔ usr_o)
 * with one live and one soft-deleted message. The clock is manual: every
 * store read of `now` returns the current `state.nowMs` (advance() moves it).
 */
function makeStore() {
  const state = { nowMs: Date.parse(T0) };
  const store = new MemoryWearStore({
    now: () => new Date(state.nowMs),
    seedUsers: [user('usr_a'), user('usr_a2'), user('usr_t'), user('usr_o')],
    seedRoles: [
      { userId: 'usr_a', role: 'admin' },
      { userId: 'usr_a2', role: 'admin' },
    ],
    seedFollows: [{ actorId: 'usr_t', targetId: 'usr_o', createdAt: T0 }],
    seedPosts: [
      post('pst_o1', 'usr_o', Date.parse(T0) - 3_000),
      post('pst_o2', 'usr_o', Date.parse(T0) - 2_000),
      post('pst_t1', 'usr_t', Date.parse(T0) - 1_000),
      post('pst_x1', 'usr_a2', Date.parse(T0) - 500), // NOT followed by usr_t
    ],
    seedLikes: [{ postId: 'pst_o1', userId: 'usr_t', createdAt: T0 }],
    seedConversations: [
      {
        conversation: {
          id: 'cnv_1',
          kind: 'direct',
          name: null,
          createdById: 'usr_t',
          createdAt: T0,
          updatedAt: T0,
        },
        members: [
          {
            conversationId: 'cnv_1',
            userId: 'usr_t',
            joinedAt: T0,
            lastReadAt: null,
            mutedUntil: null,
            requestState: 'accepted',
            role: 'owner',
          },
          {
            conversationId: 'cnv_1',
            userId: 'usr_o',
            joinedAt: T0,
            lastReadAt: null,
            mutedUntil: null,
            requestState: 'accepted',
            role: 'member',
          },
        ],
        messages: [
          {
            id: 'msg_1',
            conversationId: 'cnv_1',
            authorId: 'usr_o',
            body: 'private hello',
            createdAt: new Date(Date.parse(T0) - 2_000).toISOString(),
            deletedAt: null,
          },
          {
            id: 'msg_2',
            conversationId: 'cnv_1',
            authorId: 'usr_t',
            body: 'regretted reply',
            createdAt: new Date(Date.parse(T0) - 1_000).toISOString(),
            deletedAt: T0,
          },
        ],
      },
    ],
  });
  return { store, advance: (ms: number) => (state.nowMs += ms) };
}

const REASON = 'Support ticket #42: user reports a broken feed';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'NO_ERROR';
  } catch (e) {
    return e instanceof WearStoreError ? e.code : `UNEXPECTED:${String(e)}`;
  }
}

describe('ImpersonationRepo — start gates', () => {
  it('is admin-only, requires a real reason and a real non-self target', async () => {
    const { store } = makeStore();
    expect(await code(store.impersonation.start('usr_t', 'usr_o', REASON))).toBe('forbidden');
    expect(await code(store.impersonation.start('usr_a', 'usr_t', 'hi'))).toBe('reason_required');
    expect(await code(store.impersonation.start('usr_a', 'usr_t', 'x'.repeat(501)))).toBe(
      'reason_required',
    );
    expect(await code(store.impersonation.start('usr_a', 'usr_a', REASON))).toBe(
      'cannot_impersonate_self',
    );
    expect(await code(store.impersonation.start('usr_a', 'usr_ghost', REASON))).toBe(
      'user_not_found',
    );
  });

  it('creates a 30-minute time-boxed session with the trimmed reason', async () => {
    const { store } = makeStore();
    const s = await store.impersonation.start('usr_a', 'usr_t', `  ${REASON}  `);
    expect(s).toMatchObject({
      adminId: 'usr_a',
      targetUserId: 'usr_t',
      reason: REASON,
      endedAt: null,
      endCause: null,
    });
    expect(Date.parse(s.expiresAt) - Date.parse(s.startedAt)).toBe(IMPERSONATION_SESSION_TTL_MS);
    expect(await store.impersonation.getActive('usr_a')).toMatchObject({ id: s.id });
  });

  it('enforces one active session per admin AND per target (ratified both)', async () => {
    const { store } = makeStore();
    await store.impersonation.start('usr_a', 'usr_t', REASON);
    expect(await code(store.impersonation.start('usr_a', 'usr_o', REASON))).toBe(
      'impersonation_active',
    );
    expect(await code(store.impersonation.start('usr_a2', 'usr_t', REASON))).toBe(
      'target_under_review',
    );
    // A different admin viewing a DIFFERENT target is fine.
    const other = await store.impersonation.start('usr_a2', 'usr_o', REASON);
    expect(other.targetUserId).toBe('usr_o');
  });

  it('admin-impersonating-admin is allowed in read-only Phase 1 (ratified)', async () => {
    const { store } = makeStore();
    const s = await store.impersonation.start('usr_a', 'usr_a2', REASON);
    expect(s.targetUserId).toBe('usr_a2');
  });
});

describe('ImpersonationRepo — the audited readers', () => {
  it('serves the target profile incl. the settings VIEW, and audits the read', async () => {
    const { store } = makeStore();
    await store.settings.update('usr_t', { displayNameOverride: 'T. Citizen' });
    const s = await store.impersonation.start('usr_a', 'usr_t', REASON);
    const view = await store.impersonation.viewProfile('usr_a', s.id);
    expect(view.user).toMatchObject({ id: 'usr_t', handle: 'usr_t' });
    expect(view.settings).toMatchObject({ displayNameOverride: 'T. Citizen' });
    expect(view.counts).toMatchObject({ followers: 0, following: 1, posts: 1 });
    expect(view.role).toBeNull();
    const actions = await store.impersonation.listActions('usr_a', s.id);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: 'view_profile', dmReason: null });
  });

  it('composes the feed AS THE TARGET (follows ∪ self) with their engagement state', async () => {
    const { store } = makeStore();
    await store.saves.savePost('usr_t', 'pst_o2');
    const s = await store.impersonation.start('usr_a', 'usr_t', REASON);
    const feed = await store.impersonation.viewFeed('usr_a', s.id, { mode: 'chronological' });
    // usr_t follows usr_o and authored pst_t1; usr_a2's post is NOT visible.
    expect(feed.items.map((i) => i.id)).toEqual(['pst_t1', 'pst_o2', 'pst_o1']);
    const liked = feed.items.find((i) => i.id === 'pst_o1');
    const saved = feed.items.find((i) => i.id === 'pst_o2');
    expect(liked).toMatchObject({ viewerLiked: true, viewerSaved: false });
    expect(saved).toMatchObject({ viewerLiked: false, viewerSaved: true });
    // for-you mode ranks over everything but still flags follow-boosted posts.
    const forYou = await store.impersonation.viewFeed('usr_a', s.id);
    expect(forYou.mode).toBe('for-you');
    expect(forYou.items.map((i) => i.id)).toContain('pst_x1');
  });

  it('serves the private saves boards', async () => {
    const { store } = makeStore();
    await store.saves.savePost('usr_t', 'pst_o1');
    const s = await store.impersonation.start('usr_a', 'usr_t', REASON);
    const saves = await store.impersonation.viewSaves('usr_a', s.id);
    expect(saves.collections).toHaveLength(1);
    expect(saves.collections[0]!.posts.map((p) => p.id)).toEqual(['pst_o1']);
  });

  it('conversation LIST is metadata only — no message body anywhere', async () => {
    const { store } = makeStore();
    const s = await store.impersonation.start('usr_a', 'usr_t', REASON);
    const list = await store.impersonation.viewConversations('usr_a', s.id);
    expect(list.conversations).toHaveLength(1);
    expect(list.conversations[0]).toMatchObject({ id: 'cnv_1', messageCount: 2 });
    expect(list.conversations[0]!.members.map((m) => m.handle)).toEqual(['usr_o', 'usr_t']);
    expect(JSON.stringify(list)).not.toContain('private hello');
    expect(JSON.stringify(list)).not.toContain('regretted reply');
  });

  it('DM thread requires its own reason, fails closed on foreign threads, hides deleted bodies', async () => {
    const { store } = makeStore();
    const s = await store.impersonation.start('usr_a', 'usr_t', REASON);
    expect(await code(store.impersonation.viewDmThread('usr_a', s.id, 'cnv_1', ' '))).toBe(
      'dm_reason_required',
    );
    expect(await code(store.impersonation.viewDmThread('usr_a', s.id, 'cnv_ghost', REASON))).toBe(
      'conversation_not_found',
    );
    const thread = await store.impersonation.viewDmThread(
      'usr_a',
      s.id,
      'cnv_1',
      'DM check: abuse report on this thread',
    );
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0]).toMatchObject({
      id: 'msg_1',
      body: 'private hello',
      deleted: false,
    });
    expect(thread.messages[1]).toMatchObject({ id: 'msg_2', body: null, deleted: true });
    const dmAction = (await store.impersonation.listActions('usr_a', s.id)).find(
      (a) => a.action === 'view_dm_thread',
    );
    expect(dmAction).toMatchObject({
      dmReason: 'DM check: abuse report on this thread',
      detail: { conversationId: 'cnv_1' },
    });
  });

  it('audits every read in order and hides the log from non-admins', async () => {
    const { store } = makeStore();
    const s = await store.impersonation.start('usr_a', 'usr_t', REASON);
    await store.impersonation.viewProfile('usr_a', s.id);
    await store.impersonation.viewFeed('usr_a', s.id);
    await store.impersonation.viewNotifications('usr_a', s.id);
    const actions = await store.impersonation.listActions('usr_a', s.id);
    expect(actions.map((a) => a.action)).toEqual([
      'view_profile',
      'view_feed',
      'view_notifications',
    ]);
    expect(await store.impersonation.listActions('usr_t', s.id)).toEqual([]);
  });

  it('rejects another admin session id as not-found (no probing)', async () => {
    const { store } = makeStore();
    const s = await store.impersonation.start('usr_a', 'usr_t', REASON);
    expect(await code(store.impersonation.viewProfile('usr_a2', s.id))).toBe('session_not_found');
  });
});

describe('ImpersonationRepo — close, notify, expiry', () => {
  it('end() closes once, notifies the target institutionally, then refuses', async () => {
    const { store } = makeStore();
    const s = await store.impersonation.start('usr_a', 'usr_t', REASON);
    const closed = await store.impersonation.end('usr_a', s.id);
    expect(closed.endCause).toBe('admin_exit');
    expect(closed.endedAt).not.toBeNull();
    const inbox = await store.notifications.list('usr_t');
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({ type: 'account_accessed_by_admin', actorId: null });
    expect(inbox.items[0]!.data).toMatchObject({ sessionId: s.id, date: '2026-07-17' });
    expect(await code(store.impersonation.end('usr_a', s.id))).toBe('session_not_active');
    expect(await store.impersonation.getActive('usr_a')).toBeNull();
    // Both uniqueness slots are free again.
    await store.impersonation.start('usr_a', 'usr_t', REASON);
  });

  it('expiry refuses reads without closing; end() then records cause=expired', async () => {
    const { store, advance } = makeStore();
    const s = await store.impersonation.start('usr_a', 'usr_t', REASON);
    advance(IMPERSONATION_SESSION_TTL_MS + 1);
    expect(await code(store.impersonation.viewProfile('usr_a', s.id))).toBe('session_expired');
    expect(await store.impersonation.getActive('usr_a')).toBeNull();
    // Refusal did NOT close it (mirror: a raise would roll a close back)…
    expect((await store.notifications.list('usr_t')).items).toHaveLength(0);
    // …end() closes it at the box end and the notification fires.
    const closed = await store.impersonation.end('usr_a', s.id);
    expect(closed.endCause).toBe('expired');
    expect(closed.endedAt).toBe(closed.expiresAt);
    expect((await store.notifications.list('usr_t')).items).toHaveLength(1);
  });

  it('start() sweeps its own and the target-blocking expired sessions (with notify)', async () => {
    const { store, advance } = makeStore();
    const stale = await store.impersonation.start('usr_a', 'usr_t', REASON);
    advance(IMPERSONATION_SESSION_TTL_MS + 1);
    // usr_a starts on a NEW target: their own expired session must not block.
    const next = await store.impersonation.start('usr_a', 'usr_o', REASON);
    expect(next.targetUserId).toBe('usr_o');
    // The stale session was closed as expired and its target was notified.
    const inbox = await store.notifications.list('usr_t');
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]!.data).toMatchObject({ sessionId: stale.id });
    // A second admin can now claim usr_t too (target slot freed).
    const claimed = await store.impersonation.start('usr_a2', 'usr_t', REASON);
    expect(claimed.targetUserId).toBe('usr_t');
  });

  it('audit entries survive the close (append-only record)', async () => {
    const { store } = makeStore();
    const s = await store.impersonation.start('usr_a', 'usr_t', REASON);
    await store.impersonation.viewProfile('usr_a', s.id);
    await store.impersonation.end('usr_a', s.id);
    const actions = await store.impersonation.listActions('usr_a', s.id);
    expect(actions).toHaveLength(1);
  });
});
