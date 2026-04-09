import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import CategoryManager from "@/components/admin/CategoryManager";
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
    .single();

  if (profile?.role !== "admin") {
    redirect("/events");
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order")
    .returns<Category[]>();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/events"
        className="mb-4 inline-block text-sm text-black/60 hover:text-black"
      >
        ← Back to map
      </Link>

      <CategoryManager categories={categories ?? []} />
    </div>
  );
}
