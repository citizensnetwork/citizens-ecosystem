import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: memberships } = await supabase
    .from("user_org_roles")
    .select("org_id, role, organisations(*)")
    .eq("user_id", user.id);

  // Single org — redirect straight in
  if (memberships && memberships.length === 1) {
    const org = memberships[0].organisations as unknown as { slug: string };
    redirect(`/${org.slug}`);
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-lg space-y-6 p-6">
        <h1 className="text-2xl font-semibold text-neutral-900">
          Select Organisation
        </h1>

        {memberships && memberships.length > 0 ? (
          <ul className="space-y-3">
            {memberships.map((m) => {
              const org = m.organisations as unknown as {
                id: string;
                name: string;
                slug: string;
                description: string | null;
              };
              return (
                <li key={org.id}>
                  <Link
                    href={`/${org.slug}`}
                    className="block rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-gold hover:bg-neutral-50"
                  >
                    <p className="font-medium text-neutral-900">{org.name}</p>
                    {org.description && (
                      <p className="mt-1 text-sm text-neutral-500">
                        {org.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs uppercase tracking-wide text-neutral-400">
                      {m.role.replace("_", " ")}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center">
            <p className="text-neutral-500">
              You are not a member of any organisation yet.
            </p>
            <Link
              href="/orgs/new"
              className="mt-4 inline-block rounded-md bg-gold px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-hover"
            >
              Create Organisation
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
