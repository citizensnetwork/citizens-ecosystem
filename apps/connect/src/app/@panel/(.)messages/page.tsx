// Intercepted route — clicking "Messages" from within the app opens
// the conversation list inside the side drawer. Direct loads render
// the full /messages page.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SidePanel from "@/components/ui/SidePanel";
import ConversationList from "@/components/messaging/ConversationList";

export const dynamic = "force-dynamic";

export default async function InterceptedMessagesPanel() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <SidePanel title="Messages" fallbackHref="/events">
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <h1 className="mb-4 text-xl font-semibold text-black">Messages</h1>
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
          <ConversationList userId={user.id} />
        </div>
      </div>
    </SidePanel>
  );
}
