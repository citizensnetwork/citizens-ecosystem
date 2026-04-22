// Intercepted route — clicking "Messages" from within the app opens
// the conversation list inside the side drawer. Direct loads render
// the full /messages page.
//
// Route is inherently dynamic (auth cookie + user-scoped data) —
// no need for explicit `dynamic = "force-dynamic"`.

import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SidePanel from "@/components/ui/SidePanel";
import ConversationList from "@/components/messaging/ConversationList";

function MessagesSkeleton() {
  return (
    <div className="space-y-2 p-4 sm:p-6">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-black/10 bg-white p-3"
        >
          <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-1/3 rounded" />
            <div className="skeleton h-3 w-2/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function MessagesBody() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
      <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
        <ConversationList userId={user.id} />
      </div>
    </div>
  );
}

export default function InterceptedMessagesPanel() {
  return (
    <SidePanel title="Messages" fallbackHref="/events">
      <Suspense fallback={<MessagesSkeleton />}>
        <MessagesBody />
      </Suspense>
    </SidePanel>
  );
}

