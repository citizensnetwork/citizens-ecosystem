import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that require authentication — redirect to /login if no session */
const PROTECTED_ROUTES = ["/profile", "/events/new", "/messages", "/admin"];

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

export async function middleware(request: NextRequest) {
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

  // Enforce authentication on protected routes
  const pathname = request.nextUrl.pathname;
  if (!user && PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

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
      return NextResponse.redirect(loginUrl);
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
        return NextResponse.redirect(loginUrl);
      }
    }

    // Bio-setup gate: freshly promoted contributors must supply their
    // minimum public profile before accessing the rest of the app.
    if (
      profile?.bio_setup_required &&
      profile?.role === "contributor" &&
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

