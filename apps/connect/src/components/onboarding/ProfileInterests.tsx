"use client";

import { useState } from "react";
import type { InterestGroupWithItems } from "@/types/db";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";

type Props = {
  groups: InterestGroupWithItems[];
  selectedInterestIds: string[];
  homeLatitude: number | null;
  homeLongitude: number | null;
  notificationRadiusKm: number;
  notificationEmail: string | null;
};

export default function ProfileInterests({
  groups,
  selectedInterestIds,
  homeLatitude,
  homeLongitude,
  notificationRadiusKm,
  notificationEmail,
}: Props) {
  const [editing, setEditing] = useState(false);

  // Group selected interests by group
  const selectedByGroup = groups
    .map((g) => ({
      group: g,
      selected: g.interests.filter((i) => selectedInterestIds.includes(i.id)),
    }))
    .filter((g) => g.selected.length > 0);

  if (editing) {
    return (
      <section className="mb-8 rounded-xl border border-black/8 bg-white p-5">
        <OnboardingWizard
          editMode
          initialInterestIds={selectedInterestIds}
          initialLatitude={homeLatitude}
          initialLongitude={homeLongitude}
          initialRadius={notificationRadiusKm}
          initialNotificationEmail={notificationEmail}
          onComplete={() => {
            setEditing(false);
            // Reload to get fresh data
            window.location.reload();
          }}
        />
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-xl border border-black/8 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Your Interests</h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-[var(--gold)] hover:underline"
        >
          Edit interests
        </button>
      </div>

      {selectedByGroup.length === 0 ? (
        <p className="text-sm text-black/50">
          No interests selected yet.{" "}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[var(--gold)] hover:underline"
          >
            Add some →
          </button>
        </p>
      ) : (
        <div className="space-y-3">
          {selectedByGroup.map(({ group, selected }) => (
            <div key={group.id}>
              <p className="text-xs font-medium text-black/40 uppercase tracking-wide mb-1.5">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selected.map((interest) => (
                  <span
                    key={interest.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--gold-soft)] text-black text-xs rounded-full"
                  >
                    <span>{interest.emoji}</span>
                    <span>{interest.label}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Location + Radius display */}
      {homeLatitude !== null && homeLongitude !== null && (
        <div className="mt-4 pt-3 border-t border-black/5">
          <p className="text-xs text-black/50">
            📍 Location set • Notification radius:{" "}
            <strong className="text-black/70">{notificationRadiusKm} km</strong>
          </p>
        </div>
      )}

      {notificationEmail && (
        <div className="mt-2">
          <p className="text-xs text-black/50">
            📧 Notifications to: <span className="text-black/70">{notificationEmail}</span>
          </p>
        </div>
      )}
    </section>
  );
}
