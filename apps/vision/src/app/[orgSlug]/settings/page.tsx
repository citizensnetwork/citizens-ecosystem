import Link from "next/link";

interface SettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { orgSlug } = await params;

  const sections = [
    {
      label: "Departments",
      href: `/${orgSlug}/settings/departments`,
      description: "Manage department hierarchy",
      icon: "▦",
    },
    {
      label: "Members",
      href: `/${orgSlug}/settings/members`,
      description: "Manage team members and roles",
      icon: "👥",
    },
    {
      label: "Hierarchy",
      href: `/${orgSlug}/settings/hierarchy`,
      description: "Place this org in the parent/child tree",
      icon: "▲",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border border-border bg-surface p-5 transition-colors hover:border-accent hover:bg-surface-alt"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{s.icon}</span>
              <div>
                <p className="font-medium text-text-primary">{s.label}</p>
                <p className="text-sm text-text-secondary">{s.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
