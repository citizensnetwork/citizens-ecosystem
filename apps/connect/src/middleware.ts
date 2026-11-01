import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // Refresh the session so it doesn't expire. That is all the middleware does for pages. The force
  // re-login and bio-setup gates that used to follow were retired on 2026-11-01 (founder decision A,
  // RESUME_HERE S17): no real session reaches them (the app keeps its session in localStorage and
  // sends a Bearer token to /api, which is skipped above), and roles are read from the database on
  // every request, so a changed role takes effect at once without a sign-out. The columns
  // `force_reauth_at` and `bio_setup_required` and the trigger that stamps them stay until a
  // migration drops them.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

