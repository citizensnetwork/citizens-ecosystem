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
    <div className="mx-auto h-[calc(100dvh-3.5rem)] max-w-2xl">
      <ChatView conversationId={id} userId={user.id} />
    </div>
  );
}
