import { describe, expect, it } from 'vitest';
import { isDisplayableImageUrl, safeUrl } from './validators';

describe('safeUrl', () => {
  it('accepts plain https URLs', () => {
    expect(safeUrl('https://images.example.com/post-1.jpg')).toBe(
      'https://images.example.com/post-1.jpg',
    );
  });

  it('accepts plain http URLs', () => {
    expect(safeUrl('http://example.com/a')).toBe('http://example.com/a');
  });

  it('rejects empty / nullish input', () => {
    expect(safeUrl('')).toBeNull();
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
  });

  it('passes the credential check on bare URLs (positive control)', () => {
    // Pin behaviour against a future refactor that accidentally inverts
    // the credential-rejection boolean.
    const u = new URL('https://example.com/');
    expect(u.username).toBe('');
    expect(u.password).toBe('');
    expect(safeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('rejects or sanitises CRLF injection attempts', () => {
    // WHATWG URL strips control chars rather than throwing — pin behaviour:
    // either the URL must be rejected outright, or the canonicalised form
    // must not contain CR/LF.
    const out = safeUrl('https://example.com/\r\nLocation: evil');
    expect(out === null || !/[\r\n]/.test(out)).toBe(true);
  });

  it('rejects javascript: with embedded control chars (WHATWG strip)', () => {
    expect(safeUrl('java\tscript:alert(1)')).toBeNull();
    expect(safeUrl('java\nscript:alert(1)')).toBeNull();
  });

  it('rejects non-http(s) special schemes', () => {
    expect(safeUrl('ftp://example.com/x')).toBeNull();
    expect(safeUrl('ws://example.com/x')).toBeNull();
    expect(safeUrl('blob:https://example.com/abc')).toBeNull();
  });

  it('canonicalises backslash-as-slash in special schemes (WHATWG)', () => {
    // Known parser footgun: `\` is converted to `/` in special schemes.
    // Credential guard still applies; pin the canonicalised output.
    expect(safeUrl('https:\\\\example.com\\a')).toBe('https://example.com/a');
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(safeUrl('   https://example.com/x   ')).toBe('https://example.com/x');
    expect(safeUrl('   ')).toBeNull();
  });

  it('rejects javascript: scheme', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: scheme', () => {
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects file: scheme', () => {
    expect(safeUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects vbscript: scheme', () => {
    expect(safeUrl('vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects URLs with embedded credentials', () => {
    expect(safeUrl('https://user:pass@example.com/path')).toBeNull();
    expect(safeUrl('https://user@example.com/path')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(safeUrl('not a url')).toBeNull();
    expect(safeUrl('http://')).toBeNull();
  });

  it('canonicalises the URL', () => {
    // Trailing dots, mixed-case host, etc. WHATWG URL normalises these.
    expect(safeUrl('HTTPS://Example.COM/')).toBe('https://example.com/');
  });
});

describe('isDisplayableImageUrl', () => {
  const PROJECT = 'https://xyiajtrvhlxaeplsiajj.supabase.co';
  const OURS = `${PROJECT}/storage/v1/object/public/wear-media/usr_1/posts/1-abc.jpg`;
  const ok = (url: string, project = PROJECT) => isDisplayableImageUrl(url, project);

  it('accepts a picture in the wear-media bucket', () => {
    expect(ok(OURS)).toBe(true);
    expect(ok(`${OURS}?t=1`)).toBe(true);
    expect(ok(`${PROJECT}/storage/v1/object/public/wear-media/wear-demo-photos/photo-1.jpg`)).toBe(
      true,
    );
  });

  it('accepts a Google profile picture on any googleusercontent.com subdomain', () => {
    expect(ok('https://lh3.googleusercontent.com/a/ABC=s96-c')).toBe(true);
    expect(ok('https://lh3.photos.googleusercontent.com/x')).toBe(true);
  });

  it('reads the project URL however it is written', () => {
    expect(ok(OURS, `${PROJECT}/`)).toBe(true);
    expect(ok(OURS, 'HTTPS://XYIAJTRVHLXAEPLSIAJJ.supabase.co')).toBe(true);
  });

  it('rejects pictures on any other website', () => {
    expect(ok('https://example.org/logo.png')).toBe(false);
    expect(ok('https://ui-avatars.com/api/?name=A')).toBe(false);
    expect(ok('https://images.unsplash.com/photo-1')).toBe(false);
    expect(ok('https://cdn.test/art.png')).toBe(false);
  });

  it('rejects our host outside the wear-media public path', () => {
    expect(ok(`${PROJECT}/storage/v1/object/public/other-bucket/a.jpg`)).toBe(false);
    expect(ok(`${PROJECT}/storage/v1/object/authenticated/wear-media/a.jpg`)).toBe(false);
    expect(ok(`${PROJECT}/storage/v1/object/sign/wear-media/a.jpg?token=x`)).toBe(false);
    expect(ok(`${PROJECT}/rest/v1/profiles`)).toBe(false);
    expect(ok(`${PROJECT}/`)).toBe(false);
  });

  it('needs an object name after the bucket path', () => {
    expect(ok(`${PROJECT}/storage/v1/object/public/wear-media/`)).toBe(false);
    expect(ok(`${PROJECT}/storage/v1/object/public/wear-media`)).toBe(false);
  });

  it('cannot climb out of the bucket with dot segments', () => {
    expect(ok(`${PROJECT}/storage/v1/object/public/wear-media/../other-bucket/a.jpg`)).toBe(false);
    expect(ok(`${PROJECT}/storage/v1/object/public/wear-media/%2e%2e/other-bucket/a.jpg`)).toBe(
      false,
    );
  });

  it('rejects look-alike hosts', () => {
    const path = '/storage/v1/object/public/wear-media/a.jpg';
    expect(ok(`https://xyiajtrvhlxaeplsiajj.supabase.co.evil.com${path}`)).toBe(false);
    expect(ok(`https://evil-xyiajtrvhlxaeplsiajj.supabase.co${path}`)).toBe(false);
    expect(ok(`https://sub.xyiajtrvhlxaeplsiajj.supabase.co${path}`)).toBe(false);
    expect(ok(`https://evil.com/xyiajtrvhlxaeplsiajj.supabase.co${path}`)).toBe(false);
    expect(ok('https://googleusercontent.com/a')).toBe(false); // the wildcard needs a label
    expect(ok('https://evilgoogleusercontent.com/a')).toBe(false);
    expect(ok('https://lh3.googleusercontent.com.evil.com/a')).toBe(false);
  });

  it('rejects credentials, other ports and plain http (the CSP would not match them)', () => {
    const path = '/storage/v1/object/public/wear-media/a.jpg';
    expect(ok(`https://user:pass@xyiajtrvhlxaeplsiajj.supabase.co${path}`)).toBe(false);
    expect(ok(`https://xyiajtrvhlxaeplsiajj.supabase.co@evil.com${path}`)).toBe(false);
    expect(ok(`https://xyiajtrvhlxaeplsiajj.supabase.co:8443${path}`)).toBe(false);
    expect(ok(`http://xyiajtrvhlxaeplsiajj.supabase.co${path}`)).toBe(false);
    expect(ok('http://lh3.googleusercontent.com/a')).toBe(false);
    expect(ok('https://user:pass@lh3.googleusercontent.com/a')).toBe(false);
  });

  it('rejects other schemes and text that is not a URL', () => {
    expect(ok('javascript:alert(1)')).toBe(false);
    expect(ok('data:image/png;base64,AAAA')).toBe(false);
    expect(ok('/storage/v1/object/public/wear-media/a.jpg')).toBe(false);
    expect(ok('not a url')).toBe(false);
  });

  it('allows no storage host when the project URL cannot be read, but keeps Google', () => {
    expect(ok(OURS, 'not a url')).toBe(false);
    expect(ok(OURS, '')).toBe(false);
    expect(ok('https://lh3.googleusercontent.com/a', 'not a url')).toBe(true);
  });
});
