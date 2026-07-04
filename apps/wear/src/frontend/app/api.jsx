// ── Citizens Wear API layer ────────────────────────────────────────
// Thin fetch wrapper over the Wear /api/* surface. Every call attaches
// the Supabase access token as `Authorization: Bearer` — the session
// lives in localStorage, which the API cannot see cross-origin (Connect
// memory static-frontend-cross-origin-auth). Exposes window.CW_API.
(function () {
  function base() {
    return (window.__CW_ENV && window.__CW_ENV.API_BASE_URL) || '';
  }

  async function call(path, opts = {}) {
    const headers = { Accept: 'application/json' };
    const token = window.CW_AUTH ? await window.CW_AUTH.getAccessToken() : null;
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetch(base() + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      const err = new Error('Network error — is the Wear API reachable?');
      err.code = 'network_error';
      throw err;
    }
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      /* empty body */
    }
    if (!res.ok) {
      const err = new Error(data.message || 'Request failed (' + res.status + ')');
      err.code = data.error || 'http_error';
      err.status = res.status;
      throw err;
    }
    return data;
  }

  window.CW_API = {
    get: (path) => call(path),
    post: (path, body) => call(path, { method: 'POST', body: body === undefined ? {} : body }),
    patch: (path, body) => call(path, { method: 'PATCH', body }),
    del: (path, body) => call(path, { method: 'DELETE', body }),
  };
})();
