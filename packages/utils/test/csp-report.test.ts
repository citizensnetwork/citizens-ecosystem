import { describe, expect, it } from 'vitest';
import { CSP_REPORT_MAX_BYTES, parseCspReports, readBodyCapped, safeUrl } from '../src/csp-report';

const request = (body: string, headers: Record<string, string> = {}) => {
  const r = new Request('https://app.example/api/csp-report', { method: 'POST', body, headers });
  return r;
};

describe('safeUrl', () => {
  it('keeps origin and path, never the query or fragment', () => {
    expect(safeUrl('https://219.example/citizens/connect/auth/callback?code=SECRET#frag')).toBe(
      'https://219.example/citizens/connect/auth/callback',
    );
  });
  it('passes the CSP keywords through, and names data: and blob: by scheme only', () => {
    expect(safeUrl('inline')).toBe('inline');
    expect(safeUrl('EVAL')).toBe('eval');
    expect(safeUrl('data:text/javascript;base64,AAAA')).toBe('data');
    expect(safeUrl('blob:https://app.example/1234-5678')).toBe('blob');
  });
  it('reduces other schemes to their name, and garbage to "invalid" or ""', () => {
    expect(safeUrl('chrome-extension://abcdef/content.js')).toBe('chrome-extension');
    expect(safeUrl('not a url')).toBe('invalid');
    expect(safeUrl(42)).toBe('');
    expect(safeUrl('')).toBe('');
  });
  it('caps the length', () => {
    expect(safeUrl(`https://app.example/${'a'.repeat(500)}`).length).toBe(200);
  });
});

describe('parseCspReports', () => {
  it('reads the report-uri format (application/csp-report)', () => {
    const body = JSON.stringify({
      'csp-report': {
        'document-uri': 'https://app.example/citizens/connect/?code=SECRET',
        'violated-directive': 'script-src-elem',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'inline',
        disposition: 'report',
        'source-file': 'https://app.example/citizens/connect/',
        'line-number': 12,
        'script-sample': 'alert(document.cookie)',
      },
    });
    expect(parseCspReports(body, 'application/csp-report')).toEqual([
      {
        directive: 'script-src-elem',
        blocked: 'inline',
        page: 'https://app.example/citizens/connect/',
        disposition: 'report',
        source: 'https://app.example/citizens/connect/',
        line: 12,
      },
    ]);
  });

  it('reads the Reporting API format (application/reports+json), keeping only csp-violation entries', () => {
    const body = JSON.stringify([
      {
        type: 'csp-violation',
        url: 'https://app.example/x?token=1',
        body: {
          documentURL: 'https://app.example/x?token=1',
          effectiveDirective: 'style-src-elem',
          blockedURL: 'https://cdn.example/a.css?v=2',
          disposition: 'enforce',
        },
      },
      { type: 'deprecation', body: { id: 'x' } },
    ]);
    expect(parseCspReports(body, 'application/reports+json; charset=utf-8')).toEqual([
      {
        directive: 'style-src-elem',
        blocked: 'https://cdn.example/a.css',
        page: 'https://app.example/x',
        disposition: 'enforce',
      },
    ]);
  });

  it('keeps no field it was not asked for, and drops bad values', () => {
    const body = JSON.stringify({
      'csp-report': {
        'violated-directive': 'script-src <img onerror=x>',
        'blocked-uri': 5,
        'line-number': -3,
        evil: 'x',
      },
    });
    const [v] = parseCspReports(body, 'application/csp-report');
    expect(v).toEqual({ directive: 'script-src', blocked: '', page: '', disposition: 'unknown' });
  });

  it('caps a batch at 20', () => {
    const one = {
      type: 'csp-violation',
      body: { effectiveDirective: 'img-src', blockedURL: 'https://x.example/' },
    };
    expect(
      parseCspReports(JSON.stringify(Array(100).fill(one)), 'application/reports+json'),
    ).toHaveLength(20);
  });

  it('never throws: bad JSON, wrong shapes and unknown types give []', () => {
    expect(parseCspReports('{', 'application/csp-report')).toEqual([]);
    expect(parseCspReports('"x"', 'application/csp-report')).toEqual([]);
    expect(parseCspReports('{}', 'application/reports+json')).toEqual([]);
    expect(parseCspReports('[]', 'text/plain')).toEqual([]);
    expect(parseCspReports('{"csp-report":{}}', null)).toEqual([]);
  });
});

describe('readBodyCapped', () => {
  it('reads a small body', async () => {
    expect(await readBodyCapped(request('{"a":1}'), CSP_REPORT_MAX_BYTES)).toBe('{"a":1}');
  });
  it('refuses a body over the cap, declared or not', async () => {
    expect(await readBodyCapped(request('x'.repeat(100)), 50)).toBeNull();
    expect(await readBodyCapped(request('x', { 'content-length': '999999' }), 50)).toBeNull();
  });
});
