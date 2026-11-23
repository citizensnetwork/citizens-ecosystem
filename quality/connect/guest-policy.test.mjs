import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowsGuestRequest,
  allowsGuestResponse,
  basePath,
  handleGuestRoute,
  origin,
} from './guest-policy.mjs';

test('allows the guest route, public catalogue and CSS', () => {
  for (const suffix of [
    '',
    '/e/example',
    '/api/v1/events?limit=1',
    '/vendor/maplibre-gl/maplibre-gl.css',
  ]) {
    assert.equal(allowsGuestRequest('GET', origin + basePath + suffix), true);
  }
});

test('rejects writes, authentication, RPC, analytics and unapproved destinations', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    assert.equal(allowsGuestRequest(method, origin + basePath + '/api/v1/events'), false);
  }
  for (const suffix of [
    '/api/auth',
    '/api/v1/analytics',
    '/api/search-autocomplete',
    '/api/rest/v1/rpc/x',
    '/dashboard',
  ]) {
    assert.equal(allowsGuestRequest('GET', origin + basePath + suffix), false);
  }
  for (const url of [
    'https://219.co.za.evil.example/citizens/connect',
    'https://qa.example.test/citizens/connect',
    'https://example.test/api/v1/events',
    'https://guest:password@219.co.za/citizens/connect',
    'https://219.co.za/citizens/connect/api/v1/../auth',
  ]) {
    assert.equal(allowsGuestRequest('GET', url), false);
  }
});

test('denies redirect responses before the browser follows them', () => {
  for (const status of [301, 302, 303, 307, 308]) assert.equal(allowsGuestResponse(status), false);
  assert.equal(allowsGuestResponse(200), true);
});

test('blocked browser requests never reach the HTTP client', async () => {
  const counts = { blockedRequests: 0 };
  let aborted = false;
  await handleGuestRoute(
    {
      request: () => ({ method: () => 'POST', url: () => origin + basePath }),
      abort: () => {
        aborted = true;
      },
    },
    counts,
    () => assert.fail('A denied write reached the HTTP client'),
  );
  assert.equal(aborted, true);
  assert.equal(counts.blockedRequests, 1);
});

test('forwarding strips credentials and aborts redirects before browser navigation', async () => {
  const counts = { blockedRedirects: 0 };
  let aborted = false;
  await handleGuestRoute(
    {
      request: () => ({
        method: () => 'GET',
        url: () => origin + basePath,
        allHeaders: async () => ({
          cookie: 'synthetic',
          authorization: 'synthetic',
          'x-http-method-override': 'POST',
          accept: 'text/html',
        }),
      }),
      abort: () => {
        aborted = true;
      },
      fulfill: () => assert.fail('A redirect reached the browser'),
    },
    counts,
    async (url, options) => {
      assert.equal(url, origin + basePath);
      assert.equal(options.redirect, 'manual');
      assert.deepEqual(options.headers, { accept: 'text/html' });
      return Response.redirect('https://elsewhere.example');
    },
  );
  assert.equal(aborted, true);
  assert.equal(counts.blockedRedirects, 1);
});
