import type { Page, Route } from "@playwright/test";

// ════════════════════════════════════════════════════════════════════
//  Shared hermetic scaffolding for specs that need the app in a given
//  shape without touching any real backend.
//
//  mockAppShell  — config.js, MapTiler and the app's own /api/** answered
//                  locally (empty directory by default).
//  signInToFakeProject — a REAL-mode session: instead of the "no Supabase
//                  configured" fallback, point the app at a fake project URL,
//                  seed a supabase-js session in localStorage, and answer that
//                  project's auth / REST / RPC endpoints and realtime socket.
//                  Specs using it need `test.use({ bypassCSP: true })`: the
//                  app's CSP connect-src allows only the REAL project host.
// ════════════════════════════════════════════════════════════════════

// A reserved .test host: never resolvable, so nothing can leak to a real
// project. supabase-js keys its stored session on the first label.
export const FAKE_PROJECT = "https://e2eproj.supabase.test";

export async function mockAppShell(page: Page, env: { supabaseUrl: string; anonKey: string }) {
  await page.route("**/config.js", (route: Route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__CC_ENV = ${JSON.stringify({
        SUPABASE_URL: env.supabaseUrl,
        SUPABASE_ANON_KEY: env.anonKey,
        API_BASE_URL: "",
        MAPTILER_KEY: "e2e-test-key",
        MAPTILER_STYLE: "streets-v2",
      })};`,
    }),
  );
  await page.route("**/api.maptiler.com/**", (route: Route) =>
    route.fulfill({ json: { version: 8, sources: {}, layers: [], features: [] } }),
  );
  // Registered first = matched LAST: a catch-all for the app's own API so
  // incidental dashboard/notification reads never reach a real backend.
  await page.route("**/api/**", (route: Route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/v1/events**", (route: Route) => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/v1/places**", (route: Route) => route.fulfill({ json: { data: [] } }));
  await page.route(/\/api\/v1\/contributors(\?|$)/, (route: Route) => route.fulfill({ json: { data: [] } }));
}

export type FakeUser = { id: string; email: string; fullName: string };

export function fakeSession(u: FakeUser) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const user = {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    app_metadata: { provider: "google", providers: ["email", "google"] },
    user_metadata: { full_name: u.fullName },
    created_at: new Date().toISOString(),
  };
  const accessToken = [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 }),
    "e2e-signature",
  ].join(".");
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "e2e-refresh-token",
    user,
  };
}

export type FakeProjectOpts = {
  user: FakeUser;
  profile: { role: string; contributor_status: string; full_name?: string; avatar_url?: string | null };
  rpc?: (fn: string) => unknown;
};

/**
 * The app calls the fake "project" cross-origin, and a fulfilled response is
 * still CORS-checked by the browser — so every answer carries these headers.
 */
export const FAKE_PROJECT_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Expose-Headers": "Content-Range",
};

/**
 * Seeds the session and answers the fake project. `profile` is the row
 * auth-client.js loadSession() reads; `rpc` answers /rest/v1/rpc/<fn>
 * (default `[]`). Returns the RPC names called, in order.
 */
export async function signInToFakeProject(page: Page, opts: FakeProjectOpts): Promise<string[]> {
  const session = fakeSession(opts.user);
  await page.addInitScript((s) => {
    localStorage.setItem("sb-e2eproj-auth-token", JSON.stringify(s));
  }, session);
  return installFakeProject(page, opts, session);
}

/**
 * Answers the fake project's auth / REST / RPC endpoints and realtime socket
 * for `session` WITHOUT seeding it into localStorage, so the app starts signed
 * out. A spec that signs in through the UI (email code) registers its own
 * /auth/v1/otp and /auth/v1/verify routes AFTER this call — Playwright runs the
 * most recently registered matching route first, and `route.fallback()` hands a
 * request back to this one. Returns the RPC names called, in order.
 */
export async function installFakeProject(
  page: Page,
  opts: FakeProjectOpts,
  session: ReturnType<typeof fakeSession> = fakeSession(opts.user),
): Promise<string[]> {
  const rpcCalls: string[] = [];
  // Realtime: accept the socket locally and never connect it anywhere.
  await page.routeWebSocket(/e2eproj\.supabase\.test/, () => {});

  const cors = FAKE_PROJECT_CORS;
  await page.route(`${FAKE_PROJECT}/**`, async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const reply = (json: unknown) => route.fulfill({ json, headers: cors });
    const url = new URL(request.url());
    const wantsObject = (request.headers().accept ?? "").includes("vnd.pgrst.object");
    if (url.pathname.startsWith("/auth/v1/user")) return reply(session.user);
    if (url.pathname.startsWith("/auth/v1/token")) return reply(session);
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);
      rpcCalls.push(fn);
      return reply(opts.rpc ? opts.rpc(fn) : []);
    }
    if (url.pathname === "/rest/v1/profiles" && wantsObject) {
      return reply({
        role: opts.profile.role,
        full_name: opts.profile.full_name ?? opts.user.fullName,
        avatar_url: opts.profile.avatar_url ?? null,
        contributor_status: opts.profile.contributor_status,
      });
    }
    return reply(wantsObject ? {} : []);
  });
  return rpcCalls;
}
