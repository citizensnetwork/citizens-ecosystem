import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from '@citizens/utils';
import { __resetWearStoreForTests } from '@/lib/store';

/**
 * Route tests for the mig-163 impersonation Phase 1 surface, driven against
 * the seeded in-memory store. ruth (usr_003) is the seeded admin; samuel
 * (usr_002) is the target; the seeded DM cnv_seed_001 (hannah ↔ samuel)
 * exercises the metadata-only list + reason-gated thread rules.
 */
const mockSession = vi.fn();
vi.mock('@/lib/session', () => ({ getSession: () => mockSession() }));

import {
  DELETE as impersonationDELETE,
  GET as impersonationGET,
  POST as impersonationPOST,
} from './admin/impersonation/route';
import { GET as actionsGET } from './admin/impersonation/[id]/actions/route';
import { GET as profileGET } from './admin/impersonation/view/profile/route';
import { GET as feedGET } from './admin/impersonation/view/feed/route';
import { GET as savesGET } from './admin/impersonation/view/saves/route';
import { GET as notificationsGET } from './admin/impersonation/view/notifications/route';
import { GET as conversationsGET } from './admin/impersonation/view/conversations/route';
import { POST as dmThreadPOST } from './admin/impersonation/view/dm-thread/route';

const req = (url: string, init?: RequestInit): Request =>
  new Request(`http://localhost${url}`, init);
const route = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const jsonBody = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function asUser(id: string): void {
  mockSession.mockResolvedValue({
    user: { id, handle: id, displayName: id, email: null, avatarUrl: null, createdAt: '' },
    session: { userId: id, issuedAt: '', expiresAt: '', scopes: [] },
  });
}

const REASON = 'Support ticket #7: user reports missing saves';

async function startSession(): Promise<{ sessionId: string }> {
  asUser('usr_003');
  const res = await impersonationPOST(
    req('/api/admin/impersonation', jsonBody({ targetUserId: 'usr_002', reason: REASON })),
    route(),
  );
  expect(res.status).toBe(201);
  const data = await res.json();
  return { sessionId: data.session.id };
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  __resetWearStoreForTests();
  resetRateLimitStore();
  mockSession.mockReset();
});

describe('the admin wall', () => {
  it('401s anonymous and 403s every non-admin on every endpoint', async () => {
    mockSession.mockResolvedValue(null);
    expect((await impersonationGET(req('/api/admin/impersonation'), route())).status).toBe(401);

    asUser('usr_001'); // hannah — no platform role
    const calls = await Promise.all([
      impersonationGET(req('/api/admin/impersonation'), route()),
      impersonationPOST(
        req('/api/admin/impersonation', jsonBody({ targetUserId: 'usr_002', reason: REASON })),
        route(),
      ),
      impersonationDELETE(req('/api/admin/impersonation?sessionId=x'), route()),
      actionsGET(req('/api/admin/impersonation/x/actions'), route({ id: 'x' })),
      profileGET(req('/api/admin/impersonation/view/profile?sessionId=x'), route()),
      feedGET(req('/api/admin/impersonation/view/feed?sessionId=x'), route()),
      savesGET(req('/api/admin/impersonation/view/saves?sessionId=x'), route()),
      notificationsGET(req('/api/admin/impersonation/view/notifications?sessionId=x'), route()),
      conversationsGET(req('/api/admin/impersonation/view/conversations?sessionId=x'), route()),
      dmThreadPOST(
        req(
          '/api/admin/impersonation/view/dm-thread',
          jsonBody({ sessionId: 'x', conversationId: 'y', reason: REASON }),
        ),
        route(),
      ),
    ]);
    for (const res of calls) expect(res.status).toBe(403);
  });
});

describe('session lifecycle', () => {
  it('starts with a reason, restores via GET, blocks a second start, ends, frees', async () => {
    const { sessionId } = await startSession();

    const active = await impersonationGET(req('/api/admin/impersonation'), route());
    const activeData = await active.json();
    expect(activeData.session.id).toBe(sessionId);
    expect(activeData.target).toMatchObject({ handle: 'samuel' });

    const second = await impersonationPOST(
      req('/api/admin/impersonation', jsonBody({ targetUserId: 'usr_001', reason: REASON })),
      route(),
    );
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe('impersonation_active');

    const ended = await impersonationDELETE(
      req(`/api/admin/impersonation?sessionId=${sessionId}`),
      route(),
    );
    expect(ended.status).toBe(200);
    expect((await ended.json()).session.endCause).toBe('admin_exit');

    const cleared = await impersonationGET(req('/api/admin/impersonation'), route());
    expect((await cleared.json()).session).toBeNull();

    const again = await impersonationDELETE(
      req(`/api/admin/impersonation?sessionId=${sessionId}`),
      route(),
    );
    expect(again.status).toBe(409);
  });

  it('422s a missing target, a short reason, and a missing sessionId', async () => {
    asUser('usr_003');
    const noTarget = await impersonationPOST(
      req('/api/admin/impersonation', jsonBody({ reason: REASON })),
      route(),
    );
    expect(noTarget.status).toBe(422);
    const shortReason = await impersonationPOST(
      req('/api/admin/impersonation', jsonBody({ targetUserId: 'usr_002', reason: 'hi' })),
      route(),
    );
    expect(shortReason.status).toBe(422);
    expect((await shortReason.json()).error).toBe('reason_required');
    const noSession = await impersonationDELETE(req('/api/admin/impersonation'), route());
    expect(noSession.status).toBe(422);
  });

  it('notifies the target after the session ends (institutional voice)', async () => {
    const { sessionId } = await startSession();
    await impersonationDELETE(req(`/api/admin/impersonation?sessionId=${sessionId}`), route());
    const { getWearStore } = await import('@/lib/store');
    const inbox = await getWearStore().notifications.list('usr_002');
    const notice = inbox.items.find((n) => n.type === 'account_accessed_by_admin');
    expect(notice).toBeDefined();
    expect(notice!.actorId).toBeNull();
    expect(notice!.data).toMatchObject({ sessionId });
  });
});

describe('the audited view-as readers', () => {
  it('serves the target profile (settings view included) and logs the read', async () => {
    const { sessionId } = await startSession();
    const res = await profileGET(
      req(`/api/admin/impersonation/view/profile?sessionId=${sessionId}`),
      route(),
    );
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.user).toMatchObject({ id: 'usr_002', handle: 'samuel' });
    expect(view.counts.posts).toBeGreaterThan(0);

    const audit = await actionsGET(
      req(`/api/admin/impersonation/${sessionId}/actions`),
      route({ id: sessionId }),
    );
    const trail = await audit.json();
    expect(trail.actions.map((a: { action: string }) => a.action)).toEqual(['view_profile']);
  });

  it('serves the feed AS samuel (his follows) with his engagement flags', async () => {
    const { sessionId } = await startSession();
    const res = await feedGET(
      req(`/api/admin/impersonation/view/feed?sessionId=${sessionId}&mode=chronological`),
      route(),
    );
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.mode).toBe('chronological');
    expect(view.items.length).toBeGreaterThan(0);
    for (const item of view.items) {
      expect(['usr_001', 'usr_002']).toContain(item.author.id); // samuel follows hannah + self
    }
  });

  it('saves + notifications views answer for the target', async () => {
    const { sessionId } = await startSession();
    const saves = await savesGET(
      req(`/api/admin/impersonation/view/saves?sessionId=${sessionId}`),
      route(),
    );
    expect(saves.status).toBe(200);
    const notif = await notificationsGET(
      req(`/api/admin/impersonation/view/notifications?sessionId=${sessionId}`),
      route(),
    );
    expect(notif.status).toBe(200);
    expect(await notif.json()).toHaveProperty('unreadCount');
  });

  it('conversation list is metadata-only; the thread needs its own reason', async () => {
    const { sessionId } = await startSession();
    const list = await conversationsGET(
      req(`/api/admin/impersonation/view/conversations?sessionId=${sessionId}`),
      route(),
    );
    const listData = await list.json();
    expect(listData.conversations.map((c: { id: string }) => c.id)).toContain('cnv_seed_001');
    expect(JSON.stringify(listData)).not.toContain('Salt Tee'); // no bodies, no previews

    const noReason = await dmThreadPOST(
      req(
        '/api/admin/impersonation/view/dm-thread',
        jsonBody({ sessionId, conversationId: 'cnv_seed_001', reason: '' }),
      ),
      route(),
    );
    expect(noReason.status).toBe(422);
    expect((await noReason.json()).error).toBe('dm_reason_required');

    const thread = await dmThreadPOST(
      req(
        '/api/admin/impersonation/view/dm-thread',
        jsonBody({
          sessionId,
          conversationId: 'cnv_seed_001',
          reason: 'Reviewing reported harassment in this thread',
        }),
      ),
      route(),
    );
    expect(thread.status).toBe(200);
    const threadData = await thread.json();
    expect(threadData.messages).toHaveLength(2);

    const audit = await actionsGET(
      req(`/api/admin/impersonation/${sessionId}/actions`),
      route({ id: sessionId }),
    );
    const dmAction = (await audit.json()).actions.find(
      (a: { action: string }) => a.action === 'view_dm_thread',
    );
    expect(dmAction.dmReason).toBe('Reviewing reported harassment in this thread');
  });

  it('refuses views on an ended session (409) and unknown sessions (404)', async () => {
    const { sessionId } = await startSession();
    await impersonationDELETE(req(`/api/admin/impersonation?sessionId=${sessionId}`), route());
    const ended = await profileGET(
      req(`/api/admin/impersonation/view/profile?sessionId=${sessionId}`),
      route(),
    );
    expect(ended.status).toBe(409);
    expect((await ended.json()).error).toBe('session_not_active');
    const ghost = await profileGET(
      req('/api/admin/impersonation/view/profile?sessionId=ghost'),
      route(),
    );
    expect(ghost.status).toBe(404);
  });
});
