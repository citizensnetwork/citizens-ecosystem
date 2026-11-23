// Phase 2 guest browser network policy. Match known public routes and assets,
// with no credentials, redirects, authentication, telemetry, RPCs or writes.
export const origin = 'https://219.co.za';
export const basePath = '/citizens/connect';

const publicPages =
  /^\/(?:explore|discover|lets|community|calendar|search|map|[cep]\/[A-Za-z0-9_-]+)?\/?$/;
const publicReads =
  /^\/api\/v1\/(?:(?:events|places|contributors)(?:\/[A-Za-z0-9_-]+)?|categories|service-areas|serving)\/?$/;
const assets =
  /^\/(?:(?:assets|vendor|_next\/static|app)\/(?:[\w.-]+\/)*)?[\w.-]+\.(?:[cm]?js|jsx|css|woff2?|png|jpe?g|gif|webp|svg|ico|webmanifest)$/i;
const cdnPaths = {
  'https://api.maptiler.com': /^\/(?:maps|tiles|fonts|resources)\//,
  'https://fonts.googleapis.com': /^\/css2?$/,
  'https://fonts.gstatic.com': /^\/s\//,
  'https://unpkg.com': /^\/(?:react(?:-dom)?@18\.3\.1\/umd\/|lucide@1\.34\.0\/dist\/umd\/)/,
  'https://cdn.jsdelivr.net': /^\/npm\/@supabase\/supabase-js@2\.118\.0\/dist\/umd\/supabase\.js$/,
  'https://cdn.tailwindcss.com': /^\/$/,
};

export function allowsGuestRequest(method, rawUrl) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const url = new URL(rawUrl);
  if (url.username || url.password) return false;
  if (url.origin !== origin) return cdnPaths[url.origin]?.test(url.pathname) ?? false;
  if (url.pathname === basePath) return true;
  if (!url.pathname.startsWith(basePath + '/')) return false;
  const path = url.pathname.slice(basePath.length);
  if (path.startsWith('/api/')) return publicReads.test(path);
  return publicPages.test(path) || assets.test(path);
}

// Redirects are discarded before Chromium can follow them outside routing.
export function allowsGuestResponse(status) {
  return status < 300 || status >= 400;
}

export async function handleGuestRoute(route, counts, fetchRequest = fetch) {
  const request = route.request();
  if (!allowsGuestRequest(request.method(), request.url())) {
    counts.blockedRequests++;
    return route.abort();
  }
  try {
    const browserHeaders = await request.allHeaders();
    const headers = {};
    for (const name of ['accept', 'accept-language', 'origin', 'range', 'user-agent']) {
      if (browserHeaders[name]) headers[name] = browserHeaders[name];
    }
    const response = await fetchRequest(request.url(), {
      method: request.method(),
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (!allowsGuestResponse(response.status)) {
      await response.body?.cancel();
      counts.blockedRedirects++;
      return await route.abort();
    }
    const responseHeaders = Object.fromEntries(response.headers);
    // Node fetch decodes compressed bodies. Let Playwright set the new length.
    for (const name of ['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding']) {
      delete responseHeaders[name];
    }
    return await route.fulfill({
      status: response.status,
      headers: responseHeaders,
      body: Buffer.from(await response.arrayBuffer()),
    });
  } catch {
    counts.fetchFailures++;
    await route.abort().catch(() => {});
  }
}
