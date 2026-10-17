import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from '@citizens/utils';
import { __resetWearStoreForTests } from '@/lib/store';

/**
 * Every route that stores a picture URL for the frontend to draw in an `<img>`
 * (brand logo, story, post and concept media) turns away a link to another
 * website with a friendly 400, because Wear's Content-Security-Policy would
 * block it and leave a broken picture. Driven against the seeded in-memory
 * store: only the project URL is set (no anon key), which is enough to switch
 * the check on without switching the store to Supabase.
 */
const mockSession = vi.fn();
vi.mock('@/lib/session', () => ({ getSession: () => mockSession() }));

import { POST as brandsPOST } from './brands/route';
import { GET as brandGET, PATCH as brandPATCH } from './brands/[slug]/route';
import { POST as postsPOST } from './posts/route';
import { POST as storiesPOST } from './stories/route';
import { POST as conceptsPOST } from './concepts/route';
import { PATCH as conceptPATCH } from './concepts/[id]/route';

const PROJECT = 'https://xyiajtrvhlxaeplsiajj.supabase.co';
const OURS = `${PROJECT}/storage/v1/object/public/wear-media/usr_001/posts/1-abc.jpg`;
const OURS_2 = `${PROJECT}/storage/v1/object/public/wear-media/usr_001/posts/2-def.png`;
const GOOGLE = 'https://lh3.googleusercontent.com/a/ABC=s96-c';
const EXTERNAL = 'https://images.example/tee.jpg';

const req = (url: string, init?: RequestInit): Request =>
  new Request(`http://localhost${url}`, init);
const route = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function asUser(id: string): void {
  mockSession.mockResolvedValue({
    user: { id, handle: 'seed', displayName: 'Seed', email: null, avatarUrl: null, createdAt: '' },
    session: { userId: id, issuedAt: '', expiresAt: '', scopes: [] },
  });
}

/** The friendly 400 every route answers with. */
async function expectRejected(res: Response): Promise<void> {
  expect(res.status).toBe(400);
  const data = await res.json();
  expect(data.error).toBe('invalid_image_url');
  expect(data.message).toMatch(/upload the image/i);
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = PROJECT;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  __resetWearStoreForTests();
  resetRateLimitStore();
  mockSession.mockReset();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

describe('posts — mediaUrls', () => {
  const post = (mediaUrls: unknown[]) =>
    postsPOST(
      req(
        '/api/posts',
        send('POST', { body: 'With media', brandSlug: 'salt-and-light', mediaUrls }),
      ),
      route(),
    );

  it('keeps pictures from our storage and Google', async () => {
    asUser('usr_001');
    const res = await post([OURS, GOOGLE]);
    expect(res.status).toBe(201);
    expect((await res.json()).media.map((m: { url: string }) => m.url)).toEqual([OURS, GOOGLE]);
  });

  it('rejects a link to another website', async () => {
    asUser('usr_001');
    await expectRejected(await post([OURS, EXTERNAL]));
  });

  it('still silently drops junk that is not an http(s) link', async () => {
    asUser('usr_001');
    const res = await post([OURS, 'javascript:alert(1)', '', 42]);
    expect(res.status).toBe(201);
    expect((await res.json()).media.map((m: { url: string }) => m.url)).toEqual([OURS]);
  });

  it('accepts any http(s) link when no Supabase project is configured (dev/test)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    asUser('usr_001');
    const res = await post([EXTERNAL]);
    expect(res.status).toBe(201);
    expect((await res.json()).media[0].url).toBe(EXTERNAL);
  });
});

describe('brands — logoUrl', () => {
  it('admin mints a brand with a logo from our storage', async () => {
    asUser('usr_003'); // ruth = seeded admin
    const res = await brandsPOST(
      req('/api/brands', send('POST', { slug: 'kt', name: 'KT', logoUrl: OURS })),
      route(),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).logoUrl).toBe(OURS);
  });

  it('rejects a logo on another website when minting', async () => {
    asUser('usr_003');
    await expectRejected(
      await brandsPOST(
        req('/api/brands', send('POST', { slug: 'kt', name: 'KT', logoUrl: EXTERNAL })),
        route(),
      ),
    );
  });

  it('still lets the website link point anywhere (it is a link, not a picture)', async () => {
    asUser('usr_003');
    const res = await brandsPOST(
      req(
        '/api/brands',
        send('POST', { slug: 'kt', name: 'KT', websiteUrl: 'https://example.org/shop' }),
      ),
      route(),
    );
    expect(res.status).toBe(201); // not turned away like a logo on another website
  });

  const patch = (body: unknown) =>
    brandPATCH(
      req('/api/brands/salt-and-light', send('PATCH', body)),
      route({ slug: 'salt-and-light' }),
    );

  it('owner updates the logo to a picture on our storage', async () => {
    asUser('usr_001');
    const res = await patch({ logoUrl: OURS });
    expect(res.status).toBe(200);
    expect((await res.json()).logoUrl).toBe(OURS);
  });

  it('rejects a logo on another website and leaves the brand unchanged', async () => {
    asUser('usr_001');
    await expectRejected(await patch({ logoUrl: EXTERNAL }));
    const after = await brandGET(
      req('/api/brands/salt-and-light'),
      route({ slug: 'salt-and-light' }),
    );
    expect((await after.json()).brand.logoUrl).toBeNull();
  });

  it('an empty logo still clears it', async () => {
    asUser('usr_001');
    await patch({ logoUrl: OURS });
    const res = await patch({ logoUrl: '' });
    expect(res.status).toBe(200);
    expect((await res.json()).logoUrl).toBeNull();
  });
});

describe('stories — mediaUrl', () => {
  const story = (mediaUrl: string) =>
    storiesPOST(req('/api/stories', send('POST', { mediaKind: 'image', mediaUrl })), route());

  it('accepts a picture from our storage', async () => {
    asUser('usr_001');
    const res = await story(OURS);
    expect(res.status).toBe(201);
    expect((await res.json()).mediaUrl).toBe(OURS);
  });

  it('rejects a picture on another website', async () => {
    asUser('usr_001');
    await expectRejected(await story(EXTERNAL));
  });

  it('keeps asking for a picture when the link is not usable at all', async () => {
    asUser('usr_001');
    const res = await story('not a url');
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('empty_story');
  });

  it('accepts any http(s) link when no Supabase project is configured (dev/test)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    asUser('usr_001');
    const res = await story(EXTERNAL);
    expect(res.status).toBe(201);
    expect((await res.json()).mediaUrl).toBe(EXTERNAL);
  });
});

describe('concepts — mediaUrls', () => {
  const create = (mediaUrls: string[]) =>
    conceptsPOST(req('/api/concepts', send('POST', { title: 'Lion tee', mediaUrls })), route());

  it('creates a concept with pictures from our storage', async () => {
    asUser('usr_002');
    const res = await create([OURS, OURS_2]);
    expect(res.status).toBe(201);
    expect((await res.json()).media.map((m: { url: string }) => m.url)).toEqual([OURS, OURS_2]);
  });

  it('rejects a picture on another website when creating', async () => {
    asUser('usr_002');
    await expectRejected(await create([EXTERNAL]));
  });

  it('rejects a picture on another website when editing, and keeps the old media', async () => {
    asUser('usr_002');
    const id = (await (await create([OURS])).json()).id as string;
    const res = await conceptPATCH(
      req(`/api/concepts/${id}`, send('PATCH', { mediaUrls: [EXTERNAL] })),
      route({ id }),
    );
    await expectRejected(res);
    const ok = await conceptPATCH(
      req(`/api/concepts/${id}`, send('PATCH', { mediaUrls: [OURS_2] })),
      route({ id }),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).media.map((m: { url: string }) => m.url)).toEqual([OURS_2]);
  });
});
