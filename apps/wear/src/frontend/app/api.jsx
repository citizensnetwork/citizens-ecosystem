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

  // Two-phase image upload: (1) ask our API for a signed upload URL, (2) push the
  // bytes STRAIGHT to Supabase Storage with that token — the API never sees them
  // (mirrors Connect's uploadMedia). Returns the public URL. Throws on failure so
  // callers can fall back to the URL text input.
  async function uploadImage(file, scope) {
    const meta = await call('/api/media/sign', {
      method: 'POST',
      body: { scope: scope, filename: file.name, contentType: file.type, size: file.size },
    });
    const sb = window.CW_AUTH && window.CW_AUTH.supabase;
    if (!sb || !sb.storage) {
      const e = new Error('Upload is unavailable right now.');
      e.code = 'no_storage_client';
      throw e;
    }
    const up = await sb.storage.from(meta.bucket).uploadToSignedUrl(meta.path, meta.token, file, {
      contentType: file.type || undefined,
      upsert: true,
    });
    if (up.error) {
      const e = new Error('Upload failed. Please try again.');
      e.code = 'upload_failed';
      throw e;
    }
    return meta.publicUrl;
  }

  window.CW_API = {
    get: (path) => call(path),
    post: (path, body) => call(path, { method: 'POST', body: body === undefined ? {} : body }),
    patch: (path, body) => call(path, { method: 'PATCH', body }),
    del: (path, body) => call(path, { method: 'DELETE', body }),
    uploadImage: uploadImage,
  };
})();
