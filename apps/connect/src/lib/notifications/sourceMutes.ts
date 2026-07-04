import { isValidUUID } from "@/lib/validation";

export type NotificationSourceType = "event" | "place" | "org";

export type NotificationSourceMute = {
  type: NotificationSourceType;
  id: string;
};

const SOURCE_TYPES = new Set<NotificationSourceType>(["event", "place", "org"]);

export function normaliseSourceMutes(value: unknown): NotificationSourceMute[] {
  if (!Array.isArray(value)) return [];

  const out: NotificationSourceMute[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const type = (item as { type?: unknown }).type;
    const id = (item as { id?: unknown }).id;
    if (typeof type !== "string" || typeof id !== "string") continue;
    if (!SOURCE_TYPES.has(type as NotificationSourceType)) continue;
    if (!isValidUUID(id)) continue;

    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: type as NotificationSourceType, id });
  }

  return out;
}

export function validateSourceMutes(value: unknown): NotificationSourceMute[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const normalised = normaliseSourceMutes(value);
  return normalised.length === value.length ? normalised : null;
}

export function isSourceMuted(
  mutedSourceIds: unknown,
  entityType: "event" | "place",
  entityId: string,
  contributorId: string,
): boolean {
  const mutes = normaliseSourceMutes(mutedSourceIds);
  return mutes.some((mute) => {
    if (entityType === "event") {
      return mute.type === "event" && mute.id === entityId;
    }

    return (
      (mute.type === "place" && mute.id === entityId) ||
      (mute.type === "org" && mute.id === contributorId)
    );
  });
}
