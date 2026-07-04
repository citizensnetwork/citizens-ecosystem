import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isContributor } from "@/lib/profiles/capabilities";

/** Routes that a contributor with `bio_setup_required = true` is allowed to
 *  hit before completing setup. Everything else redirects to /contributor/setup. */
const BIO_SETUP_ALLOW = [
  "/contributor/setup",
  "/logout",
  "/login",
  "/api/contributor/setup",
  "/api/auth",
  "/auth",
];

/**
 * CORS for `/api/*` lives HERE (not next.config.ts static headers) because the
 * allow-list has several members and static headers can only echo one value:
 *   • ALLOWED_FRONTEND_ORIGIN  — the deployed static frontend (www domain)
 *   • capacitor://localhost    — the iOS Capacitor shell
 *   • http(s)://localhost      — the Android Capacitor shell
 *   • http://localhost:3001    — local static-frontend dev server
 * Requests with no Origin (same-origin, curl, server-to-server) get no CORS
 * headers — they don't need them. (Addendum §B2.)
 */
const CORS_STATIC_ORIGINS = [
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
  "http://localhost:3001",
];

function corsOriginFor(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = [process.env.ALLOWED_FRONTEND_ORIGIN, ...CORS_STATIC_ORIGINS].filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function withCors(res: NextResponse, origin: string | null): NextResponse {
  if (!origin) return res;
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Vary", "Origin");
  return res;
}

/**
 * Build a redirect response that carries every cookie currently set on
 * `supabaseResponse`. Required because `supabase.auth.signOut()` sets
 * `Set-Cookie: sb-*=; Max-Age=0` on `supabaseResponse` via our
 * `cookies.setAll` callback — returning a fresh `NextResponse.redirect(...)`
 * would discard those headers and leave stale auth cookies in the browser,
 * defeating force-reauth (audit: middleware-and-session, Finding #1).
 */
function redirectWithCookies(target: URL, supabaseResponse: NextResponse): NextResponse {
  const res = NextResponse.redirect(target);
  supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // API routes authenticate themselves — the cross-origin static frontend
  // presents `Authorization: Bearer <token>` (see src/lib/supabase/route.ts),
  // and each route returns its own 401 JSON when unauthenticated. Middleware is
  // cookie-based, so running it on `/api/*` would (a) waste a getUser() call on
  // every public read and (b) risk redirecting an API request to a (now-deleted)
  // page route. Skip it entirely and let the route handlers gate access.
  if (pathname.startsWith("/api")) {
    const origin = corsOriginFor(request);
    if (request.method === "OPTIONS") {
      return withCors(new NextResponse(null, { status: 204 }), origin);
    }
    return withCors(NextResponse.next({ request }), origin);
  }

  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key-for-prerender";

  const supabase = createServerClient(url, key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session so it doesn't expire
  const { data: { user } } = await supabase.auth.getUser();

  // Post-auth role / bio-setup enforcement (Batch E).
  if (
    user &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api/auth") &&
    !pathname.startsWith("/auth")
  ) {
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("force_reauth_at, bio_setup_required, role")
      .eq("id", user.id)
      .maybeSingle();

    // Fail-closed on transient DB error: we cannot prove the session
    // is valid, so force a re-login. Logged so a degraded gate is
    // visible in production logs.
    if (profileErr) {
      console.warn("[middleware] profile lookup failed", profileErr);
      await supabase.auth.signOut();
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("reauth", "1");
      return redirectWithCookies(loginUrl, supabaseResponse);
    }

    // Force-reauth gate: admin bumped force_reauth_at after a role change.
    // Compare against the access-token `iat`. If the JWT predates the
    // bump — or we cannot establish an iat at all — sign out and send
    // to /login. Fail-closed on parse errors.
    if (profile?.force_reauth_at) {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      let iatMs: number | null = null;
      if (accessToken) {
        const parts = accessToken.split(".");
        if (parts.length === 3) {
          try {
            const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
            const payload = JSON.parse(payloadJson) as { iat?: number };
            if (typeof payload.iat === "number") {
              iatMs = payload.iat * 1000;
            }
          } catch {
            iatMs = null;
          }
        }
      }
      const reauthMs = new Date(profile.force_reauth_at).getTime();
      // Fail-closed: if we can't verify iat, treat the JWT as stale.
      if (iatMs === null || reauthMs > iatMs) {
        await supabase.auth.signOut();
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.search = "";
        loginUrl.searchParams.set("reauth", "1");
        return redirectWithCookies(loginUrl, supabaseResponse);
      }
    }

    // Bio-setup gate: freshly promoted contributors must supply their
    // minimum public profile before accessing the rest of the app.
    if (
      profile?.bio_setup_required &&
      isContributor(profile) &&
      !BIO_SETUP_ALLOW.some((p) => pathname === p || pathname.startsWith(p + "/"))
    ) {
      const setupUrl = request.nextUrl.clone();
      setupUrl.pathname = "/contributor/setup";
      setupUrl.search = "";
      return NextResponse.redirect(setupUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

