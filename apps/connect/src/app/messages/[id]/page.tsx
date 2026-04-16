import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ChatView from "@/components/messaging/ChatView";

export const metadata = {
  title: "Chat — Citizens Connect",
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] items-start justify-center px-4 py-6">
      <div className="glass-panel flex h-full max-h-[calc(100dvh-6.5rem)] w-full max-w-2xl flex-col overflow-hidden">
        <ChatView conversationId={id} userId={user.id} />
      </div>
    </div>
  );
}
