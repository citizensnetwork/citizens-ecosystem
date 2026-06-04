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
    <div className="flex flex-col" style={{ height: "calc(100dvh - 4rem)", minHeight: 0 }}>
      <ChatView conversationId={id} userId={user.id} showBack />
    </div>
  );
}
