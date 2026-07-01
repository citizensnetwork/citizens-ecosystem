/**
 * Contributor cover-photos API (Stage C of contributor-dashboard plan).
 *
 *   POST   /api/contributor/cover-photos       — upload one image; appends to array.
 *                                                FormData: file (required), caption (optional, ≤140 chars).
 *   PATCH  /api/contributor/cover-photos       — replace the ordered list (used for
 *                                                reorder + caption edits). JSON: { photos: [{url, caption?}] }.
 *   DELETE /api/contributor/cover-photos?index=N — remove a single entry by index.
 *
 * All routes require an approved contributor session (role = 'contributor').
 * Storage writes use the admin client to bypass stale-JWT RLS failures (same
 * pattern as `/api/avatar`). Path: `${user.id}/covers/${timestamp}.{ext}`.
 *
 * MIME allowlist: PNG / JPG / GIF / WebP. SVG explicitly rejected (XSS on
 * public bucket). Decision logged in DECISIONS.md.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { validateImageFile, safeImageExtension } from "@/lib/validation";
import { isApprovedContributor } from "@/lib/profiles/capabilities";
import {
  COVER_PHOTOS_MAX,
  COVER_PHOTO_CAPTION_MAX,
  type CoverPhoto,
} from "@/types/db";

const MAX_BYTES = 15 * 1024 * 1024;

function sanitizeCaption(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, COVER_PHOTO_CAPTION_MAX);
}

type ActorOk = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
  existing: CoverPhoto[];
};
type ActorErr = { error: NextResponse };

async function loadActor(): Promise<ActorOk | ActorErr> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, contributor_status, cover_photo_urls")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !isApprovedContributor(profile)) {
    return {
      error: NextResponse.json(
        { error: "Approved contributor role required" },
        { status: 403 },
      ),
    };
  }
  const existing: CoverPhoto[] = Array.isArray(profile.cover_photo_urls)
    ? (profile.cover_photo_urls as CoverPhoto[])
    : [];
  return { supabase, user, existing };
}

export async function POST(request: Request): Promise<NextResponse> {
  const actor = await loadActor();
  if ("error" in actor) return actor.error;
  const { supabase, user, existing } = actor;

  const rl = await checkRateLimit(`cover-photo:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (existing.length >= COVER_PHOTOS_MAX) {
    return NextResponse.json(
      { error: `Maximum ${COVER_PHOTOS_MAX} cover photos.` },
      { status: 400 },
    );
  }

  let file: File | null = null;
  let caption: string | null = null;
  try {
    const form = await request.formData();
    file = form.get("file") as File | null;
    caption = sanitizeCaption(form.get("caption"));
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const validationError = validateImageFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image must be smaller than 15 MB." },
      { status: 400 },
    );
  }

  const ext = safeImageExtension(file.name);
  const path = `${user.id}/covers/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("event-images")
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error("[api/cover-photos] upload error:", uploadError);
    return NextResponse.json(
      { error: "Storage upload failed. Please try again." },
      { status: 500 },
    );
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("event-images").getPublicUrl(path);

  // Re-read just before write to mitigate TOCTOU at the 5-photo cap.
  // Two concurrent uploads could both see existing.length < 5 in loadActor
  // and end up persisting 6. Re-check now; if the cap was crossed, roll back
  // the just-uploaded blob and return 409.
  const { data: freshRow } = await supabase
    .from("profiles")
    .select("cover_photo_urls")
    .eq("id", user.id)
    .maybeSingle();
  const freshList: CoverPhoto[] = Array.isArray(freshRow?.cover_photo_urls)
    ? (freshRow!.cover_photo_urls as CoverPhoto[])
    : [];
  if (freshList.length >= COVER_PHOTOS_MAX) {
    await admin.storage.from("event-images").remove([path]).catch(() => {});
    return NextResponse.json(
      { error: `Maximum ${COVER_PHOTOS_MAX} cover photos.` },
      { status: 409 },
    );
  }

  const next: CoverPhoto[] = [...freshList, { url: publicUrl, caption }];

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ cover_photo_urls: next })
    .eq("id", user.id);
  if (updateError) {
    console.error("[api/cover-photos] update error:", updateError);
    return NextResponse.json(
      { error: "Failed to save cover photo. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ photos: next });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const actor = await loadActor();
  if ("error" in actor) return actor.error;
  const { supabase, user, existing } = actor;

  const rl = await checkRateLimit(`cover-photo:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const incoming = (body as { photos?: unknown })?.photos;
  if (!Array.isArray(incoming)) {
    return NextResponse.json(
      { error: "Body must include `photos: []`" },
      { status: 400 },
    );
  }
  if (incoming.length > COVER_PHOTOS_MAX) {
    return NextResponse.json(
      { error: `Maximum ${COVER_PHOTOS_MAX} cover photos.` },
      { status: 400 },
    );
  }

  // Only allow URLs that already exist in the contributor's stored array.
  // This prevents PATCH from being abused to inject arbitrary URLs (XSS /
  // SSRF via off-platform images) — uploads must go through POST.
  const allowedUrls = new Set(existing.map((p) => p.url));
  const seen = new Set<string>();
  const sanitised: CoverPhoto[] = [];
  for (const entry of incoming) {
    if (!entry || typeof entry !== "object") {
      return NextResponse.json({ error: "Invalid photo entry" }, { status: 400 });
    }
    const url = (entry as { url?: unknown }).url;
    if (typeof url !== "string" || !allowedUrls.has(url)) {
      return NextResponse.json(
        { error: "Unknown photo URL — upload via POST first." },
        { status: 400 },
      );
    }
    if (seen.has(url)) {
      return NextResponse.json(
        { error: "Duplicate photo URL." },
        { status: 400 },
      );
    }
    seen.add(url);
    sanitised.push({
      url,
      caption: sanitizeCaption((entry as { caption?: unknown }).caption),
    });
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ cover_photo_urls: sanitised })
    .eq("id", user.id);
  if (updateError) {
    console.error("[api/cover-photos] PATCH update error:", updateError);
    return NextResponse.json(
      { error: "Failed to save cover photos." },
      { status: 500 },
    );
  }

  // Best-effort orphan cleanup: any URL that was in `existing` but not in
  // `sanitised` (i.e. dropped by the PATCH) has its storage object removed,
  // scoped to the authenticated user's folder.
  const retained = new Set(sanitised.map((p) => p.url));
  const orphaned = existing.filter((p) => !retained.has(p.url));
  if (orphaned.length > 0) {
    try {
      const marker = `${user.id}/covers/`;
      const paths = orphaned
        .map((p) => {
          const idx = p.url.indexOf(marker);
          return idx === -1 ? null : p.url.slice(idx);
        })
        .filter((p): p is string => !!p);
      if (paths.length > 0) {
        const admin = createAdminClient();
        await admin.storage.from("event-images").remove(paths);
      }
    } catch (err) {
      console.warn("[api/cover-photos] PATCH orphan cleanup failed:", err);
    }
  }

  return NextResponse.json({ photos: sanitised });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const actor = await loadActor();
  if ("error" in actor) return actor.error;
  const { supabase, user, existing } = actor;

  const rl = await checkRateLimit(`cover-photo:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const indexRaw = url.searchParams.get("index");
  const index = indexRaw === null ? NaN : Number(indexRaw);
  if (!Number.isInteger(index) || index < 0 || index >= existing.length) {
    return NextResponse.json({ error: "Invalid index" }, { status: 400 });
  }

  const removed = existing[index];
  const next = existing.filter((_, i) => i !== index);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ cover_photo_urls: next })
    .eq("id", user.id);
  if (updateError) {
    console.error("[api/cover-photos] DELETE update error:", updateError);
    return NextResponse.json(
      { error: "Failed to remove cover photo." },
      { status: 500 },
    );
  }

  // Best-effort storage cleanup. Path is `${user.id}/covers/...`; only delete
  // objects under the authenticated user's folder.
  try {
    const marker = `${user.id}/covers/`;
    const idx = removed.url.indexOf(marker);
    if (idx !== -1) {
      const path = removed.url.slice(idx);
      const admin = createAdminClient();
      await admin.storage.from("event-images").remove([path]);
    }
  } catch (err) {
    console.warn("[api/cover-photos] storage cleanup failed:", err);
  }

  return NextResponse.json({ photos: next });
}
