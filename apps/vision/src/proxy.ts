import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { gateApiRequest } from "@/lib/api-gate";

export async function proxy(request: NextRequest) {
  // Day-one rate limiting (ecosystem Step 4c — don't repeat Wear debt #1):
  // every /api/* request passes the blanket per-IP gate before any work,
  // including the Supabase session refresh below.
  if (request.nextUrl.pathname.startsWith("/api")) {
    const gate = await gateApiRequest(request);
    if (gate.limited) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(gate.retryAfterSec) },
        }
      );
    }
    // Bearer-token callers (the static HTML frontend) carry no cookies —
    // skip the cookie session refresh; auth resolves in the route handler.
    if (request.headers.get("authorization")) {
      return NextResponse.next({ request });
    }
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — do not remove
  // Refresh session — do not remove. (Cookie callers only; the RSC page
  // tree is gone — Step 4c unit 4 — so there is no login redirect anymore.
  // The static HTML frontend authenticates via Bearer tokens, and auth
  // gating happens per-route in the handlers, not here.)
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder images
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
