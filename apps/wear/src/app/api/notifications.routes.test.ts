import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from '@citizens/utils';
import { __resetWearStoreForTests, getWearStore } from '@/lib/store';

/**
 * Route tests for the notifications surface, driven against the seeded in-memory
 * store. A real notification is produced by driving a proposal through the same
 * store singleton the routes read (usr_002 posts a concept, usr_001 — owner of
 * the verified seed brand — proposes → usr_002 is notified).
 */
const mockSession = vi.fn();
vi.mock('@/lib/session', () => ({ getSession: () => mockSession() }));

import { GET as notificationsGET } from './notifications/route';
import { POST as readPOST } from './notifications/read/route';

const req = (url: string, init?: RequestInit): Request =>
  new Request(`http://localhost${url}`, init);
const route = () => ({ params: Promise.resolve({}) });
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

/** usr_002 creates a concept; usr_001 (verified brd_001) proposes → notifies usr_002. */
async function seedProposalNotification(): Promise<void> {
  const store = getWearStore();
  const { concept } = await store.concepts.create({ creatorId: 'usr_002', title: 'Grace hoodie' });
  await store.conceptProposals.create('usr_001', { conceptId: concept.id, brandId: 'brd_001' });
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  __resetWearStoreForTests();
  resetRateLimitStore();
  mockSession.mockReset();
});

describe('GET /api/notifications', () => {
  it('401s an anonymous caller', async () => {
    mockSession.mockResolvedValue(null);
    const res = await notificationsGET(req('/api/notifications'), route());
    expect(res.status).toBe(401);
  });

  it('returns an empty, zero-unread payload for a user with none', async () => {
    asUser('usr_003');
    const res = await notificationsGET(req('/api/notifications'), route());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toEqual([]);
    expect(data.unreadCount).toBe(0);
    expect(data.nextCursor).toBeNull();
  });

  it('returns a hydrated notification for the recipient', async () => {
    await seedProposalNotification();
    asUser('usr_002');
    const res = await notificationsGET(req('/api/notifications'), route());
    const data = await res.json();
    expect(data.unreadCount).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({ type: 'concept_proposal', read: false });
    expect(data.items[0].actor).toMatchObject({ id: 'usr_001', handle: 'hannah' });
    expect(data.items[0].data).toMatchObject({ conceptTitle: 'Grace hoodie' });
  });
});

describe('POST /api/notifications/read', () => {
  it('401s an anonymous caller', async () => {
    mockSession.mockResolvedValue(null);
    const res = await readPOST(req('/api/notifications/read', jsonBody({ all: true })), route());
    expect(res.status).toBe(401);
  });

  it('marks all read and returns the fresh unread count', async () => {
    await seedProposalNotification();
    asUser('usr_002');
    const res = await readPOST(req('/api/notifications/read', jsonBody({ all: true })), route());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated).toBe(1);
    expect(data.unreadCount).toBe(0);
  });

  it('marks specific ids read (own only)', async () => {
    await seedProposalNotification();
    asUser('usr_002');
    const list = await (await notificationsGET(req('/api/notifications'), route())).json();
    const id = list.items[0].id;
    const res = await readPOST(req('/api/notifications/read', jsonBody({ ids: [id] })), route());
    const data = await res.json();
    expect(data.updated).toBe(1);
    expect(data.unreadCount).toBe(0);
  });
});
