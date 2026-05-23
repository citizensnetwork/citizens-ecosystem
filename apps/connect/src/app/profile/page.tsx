import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Event, Preferences, Profile, UserRole } from "@/types/db";
import { ORGANISER_ROLES, getRoleDisplayLabel } from "@/types/db";
import ProfileEditor from "@/components/auth/ProfileEditor";
import SocialLinksEditor from "@/components/auth/SocialLinksEditor";
import TwoFactorSetup from "@/components/auth/TwoFactorSetup";
import LinkedAccounts from "@/components/auth/LinkedAccounts";
import DeleteAccountButton from "@/components/auth/DeleteAccountButton";
import ProfileLogOutButton from "@/components/auth/ProfileLogOutButton";
import PersonalizationPanel from "@/components/profile/PersonalizationPanel";
import NotificationPreferences from "@/components/notifications/NotificationPreferences";
import QuickPanelPreferencesSection from "@/components/events/QuickPanelPreferencesSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { QUICK_ACCESS_ITEMS } from "@/lib/quickPanelOptions";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch profile, RSVPs, social counts, and friends count in parallel.
  // (Interest-group fetches were removed when the static onboarding was
  // scrapped in favour of in-map Easter-egg personalization.)
  const [
    { data: profile },
    { data: rsvps },
    { count: followersCount },
    { count: followingCount },
    { data: friendsCount },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("rsvps")
      .select("event_id, events(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", user.id),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", user.id),
    supabase.rpc("count_friends", { target_user: user.id }),
  ]);

  const rsvpedEvents: Event[] = (rsvps ?? [])
    .map((r: { event_id: string; events: unknown }) => r.events as Event)
    .filter(Boolean);

  // Get events created by this user (all users can create events now)
  const isVendor = ORGANISER_ROLES.includes(profile?.role as UserRole);
  let createdEvents: Event[] = [];
  {
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("created_by", user.id)
      .order("date", { ascending: true })
      .returns<Event[]>();
    createdEvents = data ?? [];
  }

  const displayName =
    profile?.full_name || user.user_metadata?.full_name || user.email;

  const typedProfile: Profile = {
    id: profile?.id ?? user.id,
    email: profile?.email ?? user.email ?? "",
    role: profile?.role ?? "citizen",
    contributor_kind: profile?.contributor_kind ?? null,
    full_name: profile?.full_name ?? "",
    avatar_url: profile?.avatar_url ?? null,
    onboarding_completed: profile?.onboarding_completed ?? false,
    notification_email: profile?.notification_email ?? null,
    home_latitude: profile?.home_latitude ?? null,
    home_longitude: profile?.home_longitude ?? null,
    notification_radius_km: profile?.notification_radius_km ?? 50,
    notification_digest: profile?.notification_digest ?? "instant",
    location_sharing: profile?.location_sharing ?? false,
    instagram_handle: profile?.instagram_handle ?? null,
    facebook_url: profile?.facebook_url ?? null,
    tiktok_handle: profile?.tiktok_handle ?? null,
    gender: profile?.gender ?? null,
    age_range: profile?.age_range ?? null,
    relationship_status: profile?.relationship_status ?? null,
    stage_of_life: profile?.stage_of_life ?? null,
    energy_level: profile?.energy_level ?? null,
    preferences: (profile?.preferences ?? {}) as Preferences,
    created_at: profile?.created_at ?? "",
  };

  // Build interest groups with items
  // (Interest-group / user-interest aggregation removed along with the static
  // ProfileInterests section.  Interests now surface organically via the
  // Easter-egg personalization engine.)

  return (
    <>
      <PageHeader title="My Profile" fallbackHref="/events" />
      <div className="flex min-h-[calc(100dvh-6.5rem)] items-start justify-center px-4 py-6">
        <div className="glass-panel w-full max-w-2xl px-6 py-8 sm:px-8">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        {typedProfile.avatar_url ? (
          <Image
            src={typedProfile.avatar_url}
            alt="Profile photo"
            width={64}
            height={64}
            className="w-16 h-16 rounded-full object-cover ring-2 ring-black/10"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-(--gold-soft) text-black flex items-center justify-center text-2xl font-bold uppercase">
            {(displayName as string)?.[0] ?? "?"}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
          <span
            className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${
              isVendor
                ? "bg-(--gold-soft) text-black"
                : "bg-black/5 text-black/70"
            }`}
          >
            {getRoleDisplayLabel(
              (profile?.role as UserRole) ?? "citizen",
              profile?.contributor_kind ?? null
            )}
          </span>
          <div className="mt-2 flex gap-4 text-sm text-black/70">
            <Link
              href={`/profile/${user.id}/followers`}
              className="hover:underline focus:underline focus:outline-none"
            >
              <strong className="text-black">{followersCount ?? 0}</strong>{" "}
              {followersCount === 1 ? "follower" : "followers"}
            </Link>
            <Link
              href={`/profile/${user.id}/following`}
              className="hover:underline focus:underline focus:outline-none"
            >
              <strong className="text-black">{followingCount ?? 0}</strong>{" "}
              following
            </Link>
            {(friendsCount ?? 0) > 0 && (
              <span>
                <strong className="text-black">{friendsCount}</strong>{" "}
                {friendsCount === 1 ? "friend" : "friends"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Profile Editor (avatar, name, password) ─── */}
      <section className="mb-8 rounded-xl border border-black/8 bg-white/50 p-5">
        <h2 className="text-lg font-semibold mb-4">Account Settings</h2>
        <ProfileEditor profile={typedProfile} email={user.email ?? ""} />
        <div className="mt-6 pt-6 border-t border-black/5">
          <TwoFactorSetup />
        </div>
        <div className="mt-6 pt-6 border-t border-black/5">
          <LinkedAccounts />
        </div>
      </section>

      {/* ── Notification Preferences ─── */}
      <section className="mb-8 rounded-xl border border-black/8 bg-white/50 p-5">
        <h2 className="text-lg font-semibold mb-4">Notifications</h2>
        <NotificationPreferences
          currentDigest={typedProfile.notification_digest}
          notificationEmail={typedProfile.notification_email}
          currentPrefs={typedProfile.notification_prefs ?? null}
        />
      </section>

      {/* ── Quick-panel Preferences (map quick filters) ─── */}
      <QuickPanelPreferencesSection
        options={QUICK_ACCESS_ITEMS.map((i) => ({
          id: i.id,
          label: i.label,
          color: i.color,
          svg: i.svg,
        }))}
      />

      {/* ── Social Platform Connections ─── */}
      <section className="mb-8 rounded-xl border border-black/8 bg-white/50 p-5">
        <h2 className="text-lg font-semibold mb-4">Social Platforms</h2>
        <SocialLinksEditor
          profileId={typedProfile.id}
          instagramHandle={typedProfile.instagram_handle}
          facebookUrl={typedProfile.facebook_url}
          tiktokHandle={typedProfile.tiktok_handle}
        />
      </section>

      {/* ── Interests & Location ─── */}
      <PersonalizationPanel
        percentages={typedProfile.preferences.percentages}
      />
      {/* ── Management Links ─── */}
      <section className="mb-8 flex flex-wrap gap-3">
        <Link
          href="/events/manage"
          className="rounded-xl border border-black/8 bg-white px-5 py-3 text-sm font-medium hover:shadow-sm transition-shadow"
        >
          📊 Manage Events
        </Link>
        <Link
          href="/places/manage"
          className="rounded-xl border border-black/8 bg-white px-5 py-3 text-sm font-medium hover:shadow-sm transition-shadow"
        >
          📍 Manage Places
        </Link>
        {profile?.role === "admin" && (
          <Link
            href="/admin"
            className="rounded-xl border border-(--gold)/50 bg-(--gold-soft) px-5 py-3 text-sm font-medium text-black hover:shadow-sm transition-shadow"
          >
            🛡️ Admin Panel
          </Link>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">My RSVPs</h2>
        {rsvpedEvents.length === 0 ? (
          <p className="text-sm text-gray-500">
            You haven&apos;t RSVPed to any events yet.{" "}
            <Link href="/events" className="text-(--gold) hover:underline">
              Browse events →
            </Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {rsvpedEvents.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/events/${e.id}`}
                  className="flex items-center justify-between border rounded-lg px-4 py-3 hover:shadow-sm transition-shadow"
                >
                  <div>
                    <p className="font-medium text-sm">{e.title}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(e.date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="text-(--gold) text-sm">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Created events */}
      {createdEvents.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">My Events</h2>
            <Link
              href="/events/new"
              className="text-sm bg-(--gold) text-black px-3 py-1.5 rounded-md hover:brightness-95"
            >
              + New Event
            </Link>
          </div>
          {createdEvents.length === 0 ? (
            <p className="text-sm text-gray-500">
              You haven&apos;t created any events yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {createdEvents.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/events/${e.id}`}
                    className="flex items-center justify-between border border-black/8 rounded-lg px-4 py-3 hover:shadow-sm transition-shadow bg-white/40"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-medium text-sm">{e.title}</p>
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          e.visibility === "private"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-green-100 text-green-700"
                        }`}>
                          {e.visibility === "private" ? "Private" : "Public"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {new Date(e.date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span className="text-(--gold) text-sm">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Log Out ─── */}
      <section className="mb-8">
        <ProfileLogOutButton />
      </section>

      {/* ── Danger Zone (always last) ─── */}
      <section className="mb-8 rounded-xl border border-red-100 bg-white/50 p-5">
        <h2 className="text-lg font-semibold mb-2 text-red-700">Danger Zone</h2>
        <p className="text-xs text-black/60 mb-4">
          Permanently delete your account and all associated data.
        </p>
        <DeleteAccountButton />
      </section>
        </div>
      </div>
    </>
  );
}
