import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware: refresh Supabase auth cookies on every request.
 *
 * @supabase/ssr stores the session in HTTP cookies. When the access token
 * nears expiry, the SDK needs to rotate it and write the new tokens back
 * onto the response — but Server Components cannot set cookies. Middleware
 * is the only place that both sees the incoming request cookies AND can
 * mutate the outgoing response, which is why the Supabase SSR docs list
 * it as required, not optional.
 *
 * Without this file, signInWithPassword() succeeds in the browser but the
 * Server Component at `/` cannot complete the token refresh handshake, so
 * getUser() returns null and the user is redirected back to /auth/login —
 * looking to the user like login "didn't do anything".
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

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
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() triggers the token refresh + setAll() above.
  // Do not remove. Do not run any code between createServerClient and here.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static assets)
     * - _next/image (image optimisation)
     * - favicon.ico, robots.txt, sitemap.xml
     * - any file with an extension (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
