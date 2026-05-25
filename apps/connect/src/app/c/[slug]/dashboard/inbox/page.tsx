// /c/[slug]/dashboard/inbox/page.tsx — Dashboard inbox (conversations)

import { createClient } from "@/lib/supabase/server";
import { resolveContributorSlug } from "@/lib/contributors/resolveSlug";
import { redirect } from "next/navigation";
import ConversationList from "@/components/messaging/ConversationList";

export const dynamic = "force-dynamic";

export default async function InboxDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/c/${slug}/dashboard/inbox`);

  const contributor = await resolveContributorSlug(slug);
  if (!contributor) redirect("/");

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold mb-4">Inbox</h2>
      <ConversationList userId={user.id} />
    </div>
  );
}
