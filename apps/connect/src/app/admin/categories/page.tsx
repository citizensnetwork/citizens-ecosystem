import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CategoryManager from "@/components/admin/CategoryManager";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Category } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/events");
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order")
    .returns<Category[]>();

  return (
    <>
      <PageHeader title="Manage Categories" fallbackHref="/events" />
      <div className="flex min-h-[calc(100dvh-6.5rem)] items-start justify-center px-4 py-6">
        <div className="glass-panel w-full max-w-2xl px-6 py-8 sm:px-8">
          <CategoryManager categories={categories ?? []} />
        </div>
      </div>
    </>
  );
}
