import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from '@citizens/utils';
import { __resetWearStoreForTests } from '@/lib/store';

/**
 * Tests for POST /api/media/sign. With no Supabase env the route can't mint a
 * real signed URL (that path is browser-verified against prod), but every guard
 * BEFORE the storage call — auth, rate limit, scope + media validation, and the
 * graceful "storage unavailable" degrade — is exercised here.
 */
const mockSession = vi.fn();
vi.mock('@/lib/session', () => ({ getSession: () => mockSession() }));

import { POST as signPOST } from './route';

const req = (init?: RequestInit): Request =>
  new Request('http://localhost/api/media/sign', init);
const route = () => ({ params: Promise.resolve({}) });
const body = (b: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});

function asUser(id: string): void {
  mockSession.mockResolvedValue({
    user: { id, handle: 'seed', displayName: 'Seed', email: null, avatarUrl: null, createdAt: '' },
    session: { userId: id, issuedAt: '', expiresAt: '', scopes: [] },
  });
}

const valid = { scope: 'post', filename: 'a.png', contentType: 'image/png', size: 2048 };

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  __resetWearStoreForTests();
  resetRateLimitStore();
  mockSession.mockReset();
});

describe('POST /api/media/sign', () => {
  it('401s an anonymous caller', async () => {
    mockSession.mockResolvedValue(null);
    const res = await signPOST(req(body(valid)), route());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('400s an unknown scope', async () => {
    asUser('usr_001');
    const res = await signPOST(req(body({ ...valid, scope: 'avatar' })), route());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_scope');
  });

  it('400s an svg (stored-XSS vector)', async () => {
    asUser('usr_001');
    const res = await signPOST(
      req(body({ ...valid, contentType: 'image/svg+xml' })),
      route(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_media');
  });

  it('400s an oversize image', async () => {
    asUser('usr_001');
    const res = await signPOST(
      req(body({ ...valid, size: 16 * 1024 * 1024 })),
      route(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_media');
  });

  it('503s (graceful) when Storage is unconfigured but the request is valid', async () => {
    asUser('usr_001');
    const res = await signPOST(req(body(valid)), route());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('storage_unconfigured');
  });

  it('429s after the per-user heavy cap is exhausted', async () => {
    asUser('usr_heavy');
    // heavy = 5/min; the 6th sign attempt is rejected.
    for (let i = 0; i < 5; i++) {
      const ok = await signPOST(req(body(valid)), route());
      expect(ok.status).toBe(503); // valid, just no storage env
    }
    const limited = await signPOST(req(body(valid)), route());
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toBe('rate_limited');
  });
});
