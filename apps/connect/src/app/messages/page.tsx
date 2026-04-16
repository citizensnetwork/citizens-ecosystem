import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConversationList from "@/components/messaging/ConversationList";

export const metadata = {
  title: "Messages — Citizens Connect",
  description: "Your conversations with other community members.",
};

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-start justify-center px-4 py-6">
      <div className="glass-panel w-full max-w-2xl overflow-hidden">
        <div className="border-b border-black/8 px-4 py-4">
          <h1 className="text-lg font-semibold text-black">Messages</h1>
        </div>
        <ConversationList userId={user.id} />
      </div>
    </div>
  );
}
