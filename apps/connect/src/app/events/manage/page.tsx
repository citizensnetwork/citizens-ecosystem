import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MyEventsTabs from "@/components/events/MyEventsTabs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Events — Citizens Connect",
};

export default async function ManageEventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-start justify-center px-4 py-6">
      <div className="glass-panel w-full max-w-4xl px-6 py-8 sm:px-8">
        <h1 className="text-2xl font-bold mb-2">My Events</h1>
        <p className="mb-6 text-sm text-black/55">
          Events you&apos;ve created or joined.
        </p>
        <MyEventsTabs />
      </div>
    </div>
  );
}
