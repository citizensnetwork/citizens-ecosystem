// /account/team-invites — invitee-side accept/decline for pending team_memberships
// AND pending team_owner_transfers. Notifications of type 'team_invite' and
// 'team_owner_transfer' deep-link here via data.url.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TeamInvitesClient, {
  type Invite,
  type OwnerTransfer,
} from "@/components/team/TeamInvitesClient";

export const dynamic = "force-dynamic";

export default async function TeamInvitesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/team-invites");

  const [invitesResult, transfersResult] = await Promise.all([
    supabase
      .from("team_memberships")
      .select(
        "id, role, status, created_at, contributor_id, " +
          "contributor:profiles!team_memberships_contributor_id_fkey(full_name, avatar_url, contributor_slug)"
      )
      .eq("member_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("team_owner_transfers")
      .select(
        "id, status, created_at, contributor_id, proposed_by, " +
          "contributor:profiles!team_owner_transfers_contributor_id_fkey(full_name, avatar_url, contributor_slug)"
      )
      .eq("proposed_owner_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const invites: Invite[] = (invitesResult.data ?? []) as unknown as Invite[];
  const transfers: OwnerTransfer[] = (transfersResult.data ?? []) as unknown as OwnerTransfer[];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-black">Team invites</h1>
        <p className="text-sm text-black/60 mt-1">
          Accept to join a contributor&rsquo;s team, or decline to dismiss.
        </p>
      </header>
      <TeamInvitesClient initialInvites={invites} initialTransfers={transfers} />
    </main>
  );
}
