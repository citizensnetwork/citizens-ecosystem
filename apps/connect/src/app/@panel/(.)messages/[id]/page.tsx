// Intercepted route — opening a chat from within the app renders
// the thread inside the side drawer. Direct loads render the full
// /messages/[id] page.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SidePanel from "@/components/ui/SidePanel";
import ChatView from "@/components/messaging/ChatView";

export const dynamic = "force-dynamic";

export default async function InterceptedChatPanel({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <SidePanel title="Chat" fallbackHref="/messages">
      {/* ChatView manages its own internal scroll region — we just
          need to give it a flex column to fill. */}
      <div className="flex flex-1 flex-col overflow-hidden p-4 sm:p-6">
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-black/10 bg-white">
          <ChatView conversationId={id} userId={user.id} />
        </div>
      </div>
    </SidePanel>
  );
}
