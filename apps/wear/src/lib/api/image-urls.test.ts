import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/route-context';
import { bodyImageUrl, bodyImageUrls, imageUrl } from './image-urls';
import { isDisplayableImageUrl } from '@/lib/validators';

const PROJECT = 'https://xyiajtrvhlxaeplsiajj.supabase.co';
const OURS = `${PROJECT}/storage/v1/object/public/wear-media/usr_1/posts/1-abc.jpg`;
const GOOGLE = 'https://lh3.googleusercontent.com/a/ABC=s96-c';
const EXTERNAL = 'https://images.example/tee.jpg';

function rejection(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('expected an ApiError');
}

let savedUrl: string | undefined;
beforeEach(() => {
  savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
});
afterEach(() => {
  if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
});

describe('with a Supabase project configured (production)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROJECT;
  });

  it('passes a picture from our storage or Google through, canonicalised', () => {
    expect(imageUrl(OURS)).toBe(OURS);
    expect(imageUrl(`  ${GOOGLE}  `)).toBe(GOOGLE);
  });

  it('turns a link to another website into a friendly 400', () => {
    const e = rejection(() => imageUrl(EXTERNAL));
    expect(e.status).toBe(400);
    expect(e.code).toBe('invalid_image_url');
    expect(e.message).toBe(
      "That picture is on another website, so Citizens Wear can't show it. Please upload the image instead.",
    );
  });

  it('blanks and non-http(s) text are still just dropped (that is how a field is cleared)', () => {
    expect(imageUrl('')).toBeNull();
    expect(imageUrl('   ')).toBeNull();
    expect(imageUrl('javascript:alert(1)')).toBeNull();
    expect(imageUrl('not a url')).toBeNull();
  });

  it('reads a single field from a body', () => {
    expect(bodyImageUrl({ logoUrl: OURS }, 'logoUrl')).toBe(OURS);
    expect(bodyImageUrl({}, 'logoUrl')).toBeNull();
    expect(bodyImageUrl({ logoUrl: 42 }, 'logoUrl')).toBeNull();
    expect(rejection(() => bodyImageUrl({ logoUrl: EXTERNAL }, 'logoUrl')).code).toBe(
      'invalid_image_url',
    );
  });

  it('reads a list: drops junk, keeps at most `max`, fails on any other-website link', () => {
    expect(bodyImageUrls({ u: [OURS, 'nope', 7, GOOGLE, OURS] }, 'u', 2)).toEqual([OURS, GOOGLE]);
    expect(bodyImageUrls({}, 'u', 4)).toEqual([]);
    expect(rejection(() => bodyImageUrls({ u: [OURS, EXTERNAL] }, 'u', 4)).code).toBe(
      'invalid_image_url',
    );
  });
});

describe('with no Supabase project (dev, tests, a credential-less preview)', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it('keeps accepting any http(s) link, so the paste-a-URL fallback works', () => {
    expect(imageUrl(EXTERNAL)).toBe(EXTERNAL);
    expect(imageUrl('http://localhost:9000/a.png')).toBe('http://localhost:9000/a.png');
  });

  it('still drops blanks and non-http(s) text', () => {
    expect(imageUrl('')).toBeNull();
    expect(imageUrl('javascript:alert(1)')).toBeNull();
    expect(imageUrl('data:image/png;base64,AAAA')).toBeNull();
  });
});

/**
 * The server-side list must never be wider than what the browser will draw:
 * every picture `isDisplayableImageUrl` lets through has to be inside
 * `next.config.js`'s `img-src`, or the broken picture comes back.
 */
describe('stays inside the Content-Security-Policy img-src', () => {
  const requireCjs = createRequire(import.meta.url);
  const configPath = fileURLToPath(new URL('../../../next.config.js', import.meta.url));

  async function imgSrc(): Promise<string[]> {
    delete requireCjs.cache[requireCjs.resolve(configPath)];
    const config = requireCjs(configPath) as {
      headers: () => Promise<{ headers: { key: string; value: string }[] }[]>;
    };
    const csp = (await config.headers())
      .flatMap((rule) => rule.headers)
      .find((h) => h.key === 'Content-Security-Policy');
    const directive = csp?.value.split(';').find((d) => d.trim().startsWith('img-src'));
    return (directive ?? '').trim().split(/\s+/).slice(1);
  }

  /** A host source (`https://host` or `https://*.host`) matching a URL, as a browser does. */
  function cspAllows(sources: string[], url: string): boolean {
    const u = new URL(url);
    return sources.some((src) => {
      const m = /^https:\/\/(\*\.)?([^/*]+)$/.exec(src);
      if (!m || u.protocol !== 'https:' || u.port) return false;
      return m[1] ? u.hostname.endsWith(`.${m[2]}`) : u.hostname === m[2];
    });
  }

  it('every accepted picture is allowed by the CSP', async () => {
    const sources = await imgSrc();
    expect(sources).toContain("'self'"); // positive control: the directive was really read
    const accepted = [
      OURS,
      `${PROJECT}/storage/v1/object/public/wear-media/wear-demo-photos/photo-1.jpg`,
      GOOGLE,
      'https://lh3.photos.googleusercontent.com/x',
    ];
    for (const url of accepted) {
      expect(isDisplayableImageUrl(url, PROJECT), url).toBe(true);
      expect(cspAllows(sources, url), url).toBe(true);
    }
  });

  it('the matcher itself rejects what the CSP does not list (negative control)', async () => {
    const sources = await imgSrc();
    expect(cspAllows(sources, EXTERNAL)).toBe(false);
    expect(cspAllows(sources, 'https://example.org/a.png')).toBe(false);
    expect(cspAllows(sources, 'https://googleusercontent.com/a')).toBe(false);
    expect(cspAllows(sources, 'http://lh3.googleusercontent.com/a')).toBe(false);
  });
});
