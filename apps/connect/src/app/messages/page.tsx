import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConversationList from "@/components/messaging/ConversationList";
import { PageHeader } from "@/components/ui/PageHeader";

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
    <>
      <PageHeader title="Messages" fallbackHref="/events" />
      <div className="flex min-h-[calc(100dvh-6.5rem)] items-start justify-center px-4 py-6">
        <div className="glass-panel w-full max-w-2xl overflow-hidden">
          <ConversationList userId={user.id} />
        </div>
      </div>
    </>
  );
}
