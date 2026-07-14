import { beforeEach, describe, expect, it } from 'vitest';
import {
  GATE_READ,
  GATE_WRITE,
  RATE_LIMITS,
  checkRateLimit,
  clientIp,
  gateApiRequest,
  resetRateLimitStore,
  upstashConfigured,
} from '../src/index';

/**
 * Unit tests for the extracted rate limiter + blanket gate. Without Upstash
 * env vars the limiter runs the in-memory sliding window — which is exactly
 * the path tests can exercise deterministically.
 */

beforeEach(() => {
  resetRateLimitStore();
});

describe('checkRateLimit (in-memory sliding window)', () => {
  it('allows up to the limit, then blocks with a reset hint', async () => {
    const config = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i += 1) {
      const r = await checkRateLimit('user-1', config);
      expect(r.success).toBe(true);
      expect(r.remaining).toBe(3 - (i + 1));
    }
    const blocked = await checkRateLimit('user-1', config);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);
    expect(blocked.resetMs).toBeLessThanOrEqual(60_000);
  });

  it('tracks identifiers independently', async () => {
    const config = { limit: 1, windowMs: 60_000 };
    expect((await checkRateLimit('a', config)).success).toBe(true);
    expect((await checkRateLimit('b', config)).success).toBe(true);
    expect((await checkRateLimit('a', config)).success).toBe(false);
  });

  it('resets via resetRateLimitStore', async () => {
    const config = { limit: 1, windowMs: 60_000 };
    await checkRateLimit('a', config);
    expect((await checkRateLimit('a', config)).success).toBe(false);
    resetRateLimitStore();
    expect((await checkRateLimit('a', config)).success).toBe(true);
  });

  it('ships the Connect-superset presets and no Upstash in tests', () => {
    expect(upstashConfigured).toBe(false);
    expect(RATE_LIMITS.mutation).toEqual({ limit: 30, windowMs: 60_000 });
    expect(RATE_LIMITS.message).toEqual({ limit: 20, windowMs: 60_000 });
    expect(RATE_LIMITS.auth).toEqual({ limit: 10, windowMs: 60_000 });
    expect(RATE_LIMITS.heavy).toEqual({ limit: 5, windowMs: 60_000 });
    expect(RATE_LIMITS.read).toEqual({ limit: 120, windowMs: 60_000 });
  });
});

describe('gateApiRequest (blanket per-IP method-split gate)', () => {
  const request = (method: string, ip?: string) =>
    new Request('http://localhost/api/x', {
      method,
      headers: ip ? { 'x-forwarded-for': ip } : {},
    });

  it('splits read and write buckets per IP', async () => {
    for (let i = 0; i < GATE_WRITE.limit; i += 1) {
      expect((await gateApiRequest(request('POST', '1.2.3.4'))).limited).toBe(false);
    }
    const limited = await gateApiRequest(request('POST', '1.2.3.4'));
    expect(limited.limited).toBe(true);
    expect(limited.retryAfterSec).toBeGreaterThanOrEqual(1);
    // Reads still flow for the same IP (separate bucket)…
    expect((await gateApiRequest(request('GET', '1.2.3.4'))).limited).toBe(false);
    // …and writes still flow for a different IP.
    expect((await gateApiRequest(request('POST', '5.6.7.8'))).limited).toBe(false);
  });

  it('read cap is the higher GATE_READ limit', async () => {
    expect(GATE_READ.limit).toBeGreaterThan(GATE_WRITE.limit);
  });

  it('clientIp prefers the first x-forwarded-for hop, then x-real-ip', () => {
    expect(
      clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } })),
    ).toBe('9.9.9.9');
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '8.8.8.8' } }))).toBe(
      '8.8.8.8',
    );
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });
});
