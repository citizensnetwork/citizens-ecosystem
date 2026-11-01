import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withSitePrefix } from "@/lib/siteUrl";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/events";

  // Prevent open redirect: must start with /, not //, no backslashes or colons
  function safeNextPath(raw: string): string {
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes(":")) {
      return "/events";
    }
    return raw;
  }
  const next = safeNextPath(rawNext);

  // Use NEXT_PUBLIC_SITE_URL if set (safe, server-configured), otherwise origin, plus the app's path prefix
  // when it is served under one (NEXT_PUBLIC_BASE_PATH; "" today).
  const siteUrl = withSitePrefix(process.env.NEXT_PUBLIC_SITE_URL || origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${siteUrl}${next}`);
    }
  }

  // If code exchange fails, redirect to login with error
  return NextResponse.redirect(`${siteUrl}/login?error=auth`);
}
