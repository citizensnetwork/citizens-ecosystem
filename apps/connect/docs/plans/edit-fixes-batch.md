# Edit Fixes Batch — Planning Doc

> Companion to `docs/plans/contributor-dashboard.md`. Tracks the smaller bug-fix slice the user reported in the same session.
> Created 2026-05-23.

---

## Issue inventory (user-reported)

### A. Events

| # | Title | Diagnosis (after recon) |
| - | --- | --- |
| A1 | "Editing only applicable for event owner/admins" | **Server gating already exists** in `src/app/events/[id]/edit/page.tsx` (lines 41–46). Real issue is UI surface — Edit button is likely rendered for all users on the detail panel. **Need to audit where the Edit button is rendered and gate it by `user.id === event.created_by || role==='admin'`.** |
| A2 | "Dual window still happens when editing events" | No `src/app/@panel/(.)events/[id]/edit/page.tsx` intercepted route exists. Places fix (commit `aba287a`) created the equivalent for places. **Need parallel intercepted route for event edit, plus extract `EditEventFormShell` so page + panel share content.** |

### B. Places

| # | Title | Diagnosis |
| - | --- | --- |
| B1 | "Editing only applicable for places owner/admins" | Same as A1 — server gating exists. Edit button surface needs gating. |
| B2 | "Organisation Icons + gallery upload fail with 'Media Upload failed'" | Needs investigation. Two suspects: (1) `place-images` storage RLS still blocking non-folder-prefix paths post `tighten_place_images_insert_policy`; (2) `place_media` table INSERT policy mismatch. **Action:** read `EditPlaceForm` upload code + run advisors against `storage.objects` + `place_media` policies. |
| B3 | "Location picker has no address input — needs bidirectional address ⇄ map" | New UI work. See **Section: LocationPicker bidirectional address** below. |
| B4 | "No previous/upcoming events area on place" | Part of place detail enrichment **or** part of contributor dashboard — needs scoping decision. |
| B5 | "No way to create events from edit place panel" | Belongs to contributor dashboard. See `contributor-dashboard.md`. |

### C. Place reviews

| # | Title | Diagnosis |
| - | --- | --- |
| C1 | "Could not find the 'event_id' column of 'reviews' in the schema cache" | **Confirmed via MCP:** remote `reviews` table has columns `id, place_id, user_id, rating, body, still_exists, created_at`. **No `event_id` column.** Migration `026_reviews_event_id.sql` is in the repo but never applied to remote. **Fix:** apply migration 026 to remote (idempotent; safe). Could be re-numbered to 095 to keep migrations monotonic if desired. |

---

## LocationPicker bidirectional address (B3) — design notes

Current `LocationPicker.tsx` (in `src/components/map/`) provides click-to-place pin on a MapLibre map and reverse-geocodes to display the address as read-only text under the map.

Proposed:

- Add an **address text input** above (or beside) the map.
- **Map → input:** when user drops a pin, reverse-geocode via Nominatim → fill input. (Existing behaviour; just route into the input value.)
- **Input → map:** when user types and hits Enter (or after debounce ~600ms), forward-geocode via Nominatim → move pin + recentre map. Show a small "Searching…" indicator and a result list if multiple matches.
- Same privacy disclosure that already exists ("address sent to nominatim.openstreetmap.org") stays.
- **Open questions for user:**
  - Should typed text replace the pin even if it was placed by click? (proposed: yes — last action wins)
  - Show search suggestions dropdown (multiple Nominatim results) or autopick first result?
  - Allow free-form "address" strings that can't be geocoded (manual entry that ignores the pin)?

---

## Implementation order (proposed)

Quality-gate each stage before pushing.

1. **C1 — Apply migration `026_reviews_event_id.sql`** (or renumbered 095). Smallest blast radius; unblocks event reviews.
2. **A1 + B1 — Edit-button gating audit.** Hide Edit buttons for non-owners in detail panels, profiles, place/event lists. Server gating stays (defence in depth).
3. **A2 — Event edit intercepted route.** Mirror the places fix (commit `aba287a`).
4. **B2 — Place media upload debug.** Reproduce locally, capture exact Supabase error, fix policy or path.
5. **B3 — Bidirectional address input.** After Q answered.
6. **B4 — Place upcoming/past events surface.** After Q answered (place-detail vs dashboard).
7. **B5 + contributor dashboard.** Separate batch — see `contributor-dashboard.md`.

---

## Quality gate (per stage)

Standard pipeline: `npx tsc --noEmit` · `npx vitest run` · `npx next lint --dir src` · Architect SE review · advisors no new warnings · commit + push + RESUME_HERE refresh.
