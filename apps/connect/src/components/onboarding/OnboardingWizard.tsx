"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InterestGroupWithItems } from "@/types/db";

type Props = {
  /** Pre-selected interest IDs (edit mode) */
  initialInterestIds?: string[];
  /** Pre-filled location */
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  initialRadius?: number;
  initialNotificationEmail?: string | null;
  /** If true, shows as edit mode (no skip button, different CTA) */
  editMode?: boolean;
  /** Called after save or skip */
  onComplete: () => void;
};

export default function OnboardingWizard({
  initialInterestIds = [],
  initialLatitude = null,
  initialLongitude = null,
  initialRadius = 50,
  initialNotificationEmail = null,
  editMode = false,
  onComplete,
}: Props) {
  const [groups, setGroups] = useState<InterestGroupWithItems[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initialInterestIds)
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [latitude, setLatitude] = useState<number | null>(initialLatitude);
  const [longitude, setLongitude] = useState<number | null>(initialLongitude);
  const [radius, setRadius] = useState(initialRadius);
  const [notificationEmail, setNotificationEmail] = useState(
    initialNotificationEmail ?? ""
  );
  const [locationLabel, setLocationLabel] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [locationResults, setLocationResults] = useState<
    { display_name: string; lat: string; lon: string }[]
  >([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetch interest groups + interests
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const [{ data: groupsData }, { data: interestsData }] =
        await Promise.all([
          supabase
            .from("interest_groups")
            .select("*")
            .order("sort_order"),
          supabase.from("interests").select("*").order("sort_order"),
        ]);

      if (cancelled) return;

      const mapped: InterestGroupWithItems[] = (groupsData ?? []).map((g) => ({
        ...g,
        interests: (interestsData ?? []).filter((i) => i.group_id === g.id),
      }));

      setGroups(mapped);
      // Expand first group by default
      if (mapped.length > 0) {
        setExpandedGroups(new Set([mapped[0].id]));
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reverse-geocode initial coords for label
  useEffect(() => {
    if (initialLatitude && initialLongitude) {
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${initialLatitude}&lon=${initialLongitude}`,
        { headers: { "User-Agent": "CitizensConnect/1.0" } }
      )
        .then((r) => r.json())
        .then((data) => {
          if (data.display_name) {
            const parts = data.display_name.split(",");
            setLocationLabel(parts.slice(0, 3).join(",").trim());
          }
        })
        .catch(() => {});
    }
  }, [initialLatitude, initialLongitude]);

  const toggleInterest = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  async function handleGeolocate() {
    if (!navigator.geolocation) return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        // Reverse geocode for label
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
            { headers: { "User-Agent": "CitizensConnect/1.0" } }
          );
          const data = await res.json();
          if (data.display_name) {
            const parts = data.display_name.split(",");
            setLocationLabel(parts.slice(0, 3).join(",").trim());
          }
        } catch {
          setLocationLabel(
            `${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`
          );
        }
        setLocationLoading(false);
      },
      () => {
        setLocationLoading(false);
      }
    );
  }

  async function handleSearchLocation() {
    if (!locationSearch.trim()) return;
    setLocationLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationSearch)}&limit=5`,
        { headers: { "User-Agent": "CitizensConnect/1.0" } }
      );
      const data = await res.json();
      setLocationResults(data ?? []);
    } catch {
      setLocationResults([]);
    }
    setLocationLoading(false);
  }

  function selectLocation(result: {
    display_name: string;
    lat: string;
    lon: string;
  }) {
    setLatitude(parseFloat(result.lat));
    setLongitude(parseFloat(result.lon));
    const parts = result.display_name.split(",");
    setLocationLabel(parts.slice(0, 3).join(",").trim());
    setLocationResults([]);
    setLocationSearch("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interest_ids: Array.from(selectedIds),
          home_latitude: latitude,
          home_longitude: longitude,
          notification_radius_km: radius,
          notification_email: notificationEmail || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }

      onComplete();
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  async function handleSkip() {
    setSaving(true);
    try {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interest_ids: [],
          home_latitude: null,
          home_longitude: null,
          notification_radius_km: 50,
          notification_email: null,
        }),
      });
    } catch {
      // Skip always succeeds from the user's perspective
    }
    onComplete();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <div className="w-8 h-8 border-2 border-black/20 border-t-(--gold) rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold mb-1">
          {editMode ? "Edit Your Interests" : "Welcome to Citizens Connect"}
        </h1>
        <p className="text-sm text-black/60">
          {editMode
            ? "Update your interests, location, and notification preferences."
            : "Tell us about yourself so we can show you events and communities that matter to you."}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">
          {error}
        </div>
      )}

      {/* Interest Groups — collapsible sections */}
      <div className="space-y-2 mb-6">
        {groups.map((group) => {
          const isExpanded = expandedGroups.has(group.id);
          const selectedInGroup = group.interests.filter((i) =>
            selectedIds.has(i.id)
          ).length;

          return (
            <div
              key={group.id}
              className="border border-black/8 rounded-xl overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-black/2 transition-colors"
                aria-expanded={isExpanded}
              >
                <span className="font-medium text-sm">{group.label}</span>
                <span className="flex items-center gap-2 text-xs text-black/50">
                  {selectedInGroup > 0 && (
                    <span className="bg-(--gold-soft) text-black px-2 py-0.5 rounded-full font-medium">
                      {selectedInGroup}
                    </span>
                  )}
                  <svg
                    className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {group.interests.map((interest) => {
                    const isSelected = selectedIds.has(interest.id);
                    return (
                      <button
                        key={interest.id}
                        type="button"
                        onClick={() => toggleInterest(interest.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border ${
                          isSelected
                            ? "bg-(--gold-soft) border-(--gold) text-black font-medium"
                            : "bg-white border-black/8 text-black/70 hover:border-black/20"
                        }`}
                      >
                        <span>{interest.emoji}</span>
                        <span className="truncate">{interest.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Location Section */}
      <div className="border border-black/8 rounded-xl p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">Your Location</h2>
        <p className="text-xs text-black/50 mb-3">
          Help us find events near you. Your exact location is never shown publicly.
        </p>

        {locationLabel && (
          <div className="bg-(--gold-soft) text-black text-sm px-3 py-2 rounded-lg mb-3 flex items-center justify-between">
            <span>{locationLabel}</span>
            <button
              type="button"
              onClick={() => {
                setLatitude(null);
                setLongitude(null);
                setLocationLabel("");
              }}
              className="text-black/50 hover:text-black ml-2"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={handleGeolocate}
            disabled={locationLoading}
            className="px-3 py-2 bg-black text-white text-xs rounded-lg hover:bg-black/80 disabled:opacity-50"
          >
            {locationLoading ? "Locating..." : "Use My Location"}
          </button>
          <span className="text-xs text-black/40 self-center">or</span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={locationSearch}
            onChange={(e) => setLocationSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchLocation()}
            placeholder="Search city or area..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleSearchLocation}
            disabled={locationLoading}
            className="px-3 py-2 border rounded-lg text-sm hover:bg-black/5 disabled:opacity-50"
          >
            Search
          </button>
        </div>

        {locationResults.length > 0 && (
          <ul className="mt-2 border rounded-lg divide-y max-h-40 overflow-y-auto">
            {locationResults.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => selectLocation(r)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 truncate"
                >
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Radius slider */}
        {latitude !== null && longitude !== null && (
          <div className="mt-4">
            <label className="text-xs text-black/60 block mb-1">
              Notification radius: <strong>{radius} km</strong>
            </label>
            <input
              type="range"
              min={10}
              max={200}
              step={10}
              value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value, 10))}
              className="w-full accent-(--gold)"
            />
            <div className="flex justify-between text-[10px] text-black/40">
              <span>10 km</span>
              <span>200 km</span>
            </div>
          </div>
        )}
      </div>

      {/* Notification Email */}
      <div className="border border-black/8 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold mb-2">Notification Email</h2>
        <p className="text-xs text-black/50 mb-3">
          Optional — receive emails about events matching your interests.
        </p>
        <input
          type="email"
          value={notificationEmail}
          onChange={(e) => setNotificationEmail(e.target.value)}
          placeholder="your@email.com"
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        {!editMode && (
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="px-4 py-2.5 text-sm text-black/60 hover:text-black rounded-lg disabled:opacity-50"
          >
            Skip for now
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-(--gold) text-black text-sm font-medium rounded-lg hover:brightness-95 disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : editMode
              ? "Save Changes"
              : "Save & Start Exploring"}
        </button>
      </div>
    </div>
  );
}
