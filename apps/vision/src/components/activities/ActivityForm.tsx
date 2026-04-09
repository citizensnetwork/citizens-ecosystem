"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACTIVITY_TYPES } from "@/lib/schemas/activity";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";
import { LocationPicker } from "@/components/map/LocationPicker";
import type { Department } from "@/types/db";
import type { Goal } from "@/types/db";

interface ActivityFormProps {
  orgId: string;
  orgSlug: string;
  departments: Department[];
  goals?: Pick<Goal, "id" | "title">[];
  initialData?: {
    id: string;
    title: string;
    description: string | null;
    type: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
    latitude: number | null;
    longitude: number | null;
    location_name: string | null;
    participant_count: number;
    department_id: string | null;
    activity_tags?: { tag: string }[];
    linked_goal_ids?: string[];
  };
}

export function ActivityForm({
  orgId,
  orgSlug,
  departments,
  goals,
  initialData,
}: ActivityFormProps) {
  const router = useRouter();
  const isEditing = !!initialData;

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(
    initialData?.description ?? ""
  );
  const [type, setType] = useState(initialData?.type ?? "event");
  const [date, setDate] = useState(initialData?.date ?? "");
  const [startTime, setStartTime] = useState(initialData?.start_time ?? "");
  const [endTime, setEndTime] = useState(initialData?.end_time ?? "");
  const [latitude, setLatitude] = useState<number | null>(
    initialData?.latitude ?? null
  );
  const [longitude, setLongitude] = useState<number | null>(
    initialData?.longitude ?? null
  );
  const [locationName, setLocationName] = useState(
    initialData?.location_name ?? ""
  );
  const [participantCount, setParticipantCount] = useState(
    initialData?.participant_count ?? 0
  );
  const [departmentId, setDepartmentId] = useState(
    initialData?.department_id ?? ""
  );
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(
    initialData?.activity_tags?.map((t) => t.tag) ?? []
  );
  const [linkedGoalIds, setLinkedGoalIds] = useState<string[]>(
    initialData?.linked_goal_ids ?? []
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function addTag() {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed) && tags.length < 20) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      date,
      start_time: startTime || undefined,
      end_time: endTime || undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      location_name: locationName.trim() || undefined,
      participant_count: participantCount,
      department_id: departmentId || undefined,
      tags,
    };

    try {
      const url = isEditing
        ? `/api/activities/${initialData.id}`
        : `/api/activities?org_id=${orgId}`;

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save activity");
        return;
      }

      // Link goals if any selected (for new activities)
      if (!isEditing && linkedGoalIds.length > 0) {
        const result = await res.json();
        const activityId = result?.data?.id;
        if (activityId) {
          await Promise.all(
            linkedGoalIds.map((goalId) =>
              fetch(`/api/goals/${goalId}/alignment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  activity_id: activityId,
                  link_type: "explicit",
                  confidence: 1.0,
                }),
              })
            )
          );
        }
      }

      router.push(`/${orgSlug}/activities`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-700/50 bg-red-900/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <label
          htmlFor="title"
          className="block text-sm font-medium text-text-primary"
        >
          Title *
        </label>
        <input
          id="title"
          type="text"
          required
          minLength={2}
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="Activity title"
        />
      </div>

      {/* Type + Date row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="type"
            className="block text-sm font-medium text-text-primary"
          >
            Type *
          </label>
          <select
            id="type"
            required
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="date"
            className="block text-sm font-medium text-text-primary"
          >
            Date *
          </label>
          <input
            id="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Times */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="startTime"
            className="block text-sm font-medium text-text-primary"
          >
            Start Time
          </label>
          <input
            id="startTime"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label
            htmlFor="endTime"
            className="block text-sm font-medium text-text-primary"
          >
            End Time
          </label>
          <input
            id="endTime"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-text-primary"
        >
          Description
        </label>
        <textarea
          id="description"
          rows={4}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="What happened during this activity?"
        />
      </div>

      {/* Location + Participants */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="locationName"
              className="block text-sm font-medium text-text-primary"
            >
              Location Name
            </label>
            <input
              id="locationName"
              type="text"
              maxLength={300}
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="e.g. Community Hall, Ward 5"
            />
          </div>
          <div>
            <label
              htmlFor="participantCount"
              className="block text-sm font-medium text-text-primary"
            >
              Participants
            </label>
            <input
              id="participantCount"
              type="number"
              min={0}
              value={participantCount}
              onChange={(e) =>
                setParticipantCount(parseInt(e.target.value, 10) || 0)
              }
              className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {/* Map Location Picker */}
        <div>
          <label className="block text-sm font-medium text-text-primary">
            Pin Location on Map
          </label>
          <p className="mb-2 text-xs text-text-secondary">
            Search or click the map to set the activity&apos;s coordinates
          </p>
          <LocationPicker
            latitude={latitude}
            longitude={longitude}
            locationName={locationName}
            onLocationChange={(lat, lng, name) => {
              setLatitude(lat);
              setLongitude(lng);
              if (name && !locationName) setLocationName(name);
            }}
          />
        </div>
      </div>

      {/* Department */}
      <div>
        <label
          htmlFor="departmentId"
          className="block text-sm font-medium text-text-primary"
        >
          Department
        </label>
        <select
          id="departmentId"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">No department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-text-primary">
          Tags
        </label>
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            maxLength={50}
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Add a tag and press Enter"
          />
          <button
            type="button"
            onClick={addTag}
            className="rounded-md bg-surface-alt px-3 py-2 text-sm text-text-primary hover:bg-border"
          >
            Add
          </button>
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-accent-light px-2.5 py-0.5 text-xs text-accent"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-0.5 hover:text-highlight"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Link to Goals */}
      {goals && goals.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-text-primary">
            Link to Goals
          </label>
          <p className="mb-2 text-xs text-text-secondary">
            Select goals this activity contributes toward
          </p>
          <div className="mt-1 space-y-1.5 rounded-md border border-border bg-surface p-3">
            {goals.map((goal) => (
              <label key={goal.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={linkedGoalIds.includes(goal.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setLinkedGoalIds([...linkedGoalIds, goal.id]);
                    } else {
                      setLinkedGoalIds(
                        linkedGoalIds.filter((id) => id !== goal.id)
                      );
                    }
                  }}
                  className="rounded border-border"
                />
                <span className="text-text-primary">{goal.title}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-highlight transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting
            ? "Saving..."
            : isEditing
              ? "Update Activity"
              : "Create Activity"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-alt"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
