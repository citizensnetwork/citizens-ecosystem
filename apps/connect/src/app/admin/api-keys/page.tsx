import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ApiKeyManager from "@/components/admin/ApiKeyManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "API Keys — Admin · Citizens Connect",
};

export default async function AdminApiKeysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/events");

  // Pre-fetch data in parallel so the client component renders without
  // its own waterfall.
  const [keysRes, ownersRes] = await Promise.all([
    supabase
      .from("api_keys")
      .select(
        "id, name, key_prefix, scopes, rate_limit_per_minute, owner_id, last_used_at, disabled_at, created_at",
      )
      .is("disabled_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("profiles")
      .select("id, email, full_name, contributor_slug")
      .in("role", ["contributor", "admin"])
      .order("full_name", { ascending: true })
      .limit(500),
  ]);

  return (
    <>
      <PageHeader title="API Keys" fallbackHref="/events" />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="mb-6 text-sm text-black/60">
          Issue, list, and revoke API keys for partner ecosystem apps. Raw keys
          are displayed only once at mint time — store them in a secret manager
          immediately.
        </p>
        <ApiKeyManager
          initialKeys={keysRes.data ?? []}
          owners={ownersRes.data ?? []}
        />
      </div>
    </>
  );
}
