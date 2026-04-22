// Intercepted route — opening a chat from within the app renders
// the thread inside the side drawer. Direct loads render the full
// /messages/[id] page.
//
// Route is inherently dynamic (relies on auth cookies) — no need
// for explicit `dynamic = "force-dynamic"`.

import { cache, Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import SidePanel from "@/components/ui/SidePanel";
import ChatView from "@/components/messaging/ChatView";

// Cached so both the shell (for the title) and the body (for the
// auth/participant check + render) share one DB round-trip.
const getConversationContext = cache(async (conversationId: string) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, rows: [] as ParticipantRow[] };

  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("user_id, profiles(full_name)")
    .eq("conversation_id", conversationId);

  return {
    user,
    rows: ((participants ?? []) as unknown as ParticipantRow[]) ?? [],
  };
});

type ParticipantRow = {
  user_id: string;
  profiles: { full_name: string | null } | null;
};

function ChatSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4 sm:p-6">
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-black/10 bg-white p-4">
        <div className="space-y-3">
          <div className="skeleton ml-auto h-8 w-2/5 rounded-2xl" />
          <div className="skeleton h-8 w-1/2 rounded-2xl" />
          <div className="skeleton ml-auto h-8 w-1/3 rounded-2xl" />
          <div className="skeleton h-8 w-2/5 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

async function ChatBody({ id }: { id: string }) {
  const { user, rows } = await getConversationContext(id);
  if (!user) redirect("/login");

  const isMember = rows.some((r) => r.user_id === user.id);
  if (!isMember) notFound();

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4 sm:p-6">
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-black/10 bg-white">
        <ChatView conversationId={id} userId={user.id} />
      </div>
    </div>
  );
}

export default async function InterceptedChatPanel({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Resolve the counterparty name for the drawer header. This runs
  // alongside the body via the shared cached getter, so it's not an
  // extra round-trip.
  const { user, rows } = await getConversationContext(id);
  if (!user) redirect("/login");
  const other = rows.find((r) => r.user_id !== user.id);
  const title = other?.profiles?.full_name ?? "Chat";

  return (
    <SidePanel title={title} fallbackHref="/messages">
      <Suspense fallback={<ChatSkeleton />}>
        <ChatBody id={id} />
      </Suspense>
    </SidePanel>
  );
}

