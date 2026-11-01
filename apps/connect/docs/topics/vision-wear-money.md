# Topic: Vision, Wear and monetisation (V, W and M items)

> Open work for Citizens Vision and Citizens Wear, and the monetisation placeholder. Moved verbatim from [`RESUME_HERE.md`](../../RESUME_HERE.md) (sections 4V, 4W and 4M) on 2026-11-01 by the slimming PR, so nothing was lost. The one-line index entry for each item stays in RESUME_HERE section 4 (stable ID, title, priority, size). Relative links in the moved text were re-based so they resolve from this folder; the words are unchanged. Find an item by searching this file for its ID cell, for example `| C10 |`.

### V. Vision (live since 2026-07-18)
| ID | Item | Pri | Size |
|---|---|---|---|
| V3 | Phase D: exports, partnerships, scheduled reports. | Parked | L |
| V4 | Adoption: 1 Vision organisation exists and none is linked to a Connect Contributor. Onboard a real organisation (founder). Until one is linked, the Community Network screen (V2, built) shows its honest empty state. | P2 | — |
| V5 | `apps/vision/docs/ADMIN_GUIDE.md` still describes the retired Connect-sync subsystem. | P3 | S |
| V7 | **DONE 2026-10-19 (PR #237, `116bcd1`, issue #199).** A logged activity can gain a place. The Designer approved the deviations, including fix round 1: no alert, Save stays disabled with an inline error, and the pin is kept unless the name changes. **Add a place to an activity that is already logged.** The Place field (V6, done) is on the Log form only. An activity logged before it, or saved as a name only, has no position, so it is not on the Timeline Map, and there is no edit screen to fix that (`PATCH /api/activities/:id` already accepts `latitude`, `longitude` and `location_name`). Add a small "Add a place" action on a row in Spaces, Activities that reuses the same field. (Found in V6.) | P2 | S |

### W. Wear
| ID | Item | Pri | Size |
|---|---|---|---|
| W1 | **Impersonation Phase 2 (write-as-user)**: needs its own ratified design session first. The lockout on an admin impersonating another admin is the load-bearing guardrail. (§3AB, roles MD §7.1/§7.2-2) | P3 | L |
| W2 | Launch fast-follows: brand **edit** screen (logo etc.; `PATCH /api/brands/:slug` exists, no UI) · proposal-mockup upload + story video (the pipeline is images-only) · nav-level unread badge · share-to-DM (`dm` channel reserved) · upvote-notification dedupe · statuses-bar pagination · full desktop layouts. (§3T, §3W) | P3 | S–M each |
| W3 | Capacitor native shell (the JS bridge and deep-link auth are ready; no `capacitor.config`, `android` or `ios` yet). When it ships, add `citizenswear://auth-callback` to the Supabase redirect allow-list. | Parked | M |
| W4 | Marketplace v2 open questions: brand-verification depth (KYC or light review), Brand Workspace scope, dispute tooling, concept search/categories, creator portfolio. | Parked | L |
| W5 | **Finish the picture-host guard (PR #135, merged, did the API half).** (a) A DB `CHECK` on `wear.brands.logo_url`, `post_media.url`, `concept_media.url` and `stories.media_url` (host on our storage or Google), because RLS lets an author write these straight through PostgREST; needs a migration, so ask the founder first. (b) A neutral fallback tile (no layout shift) for post, concept and story pictures, which still show the browser's broken icon if a picture fails. | P3 | S |

### M. Monetisation (in no recent plan; listed so it isn't forgotten)
| ID | Item | Pri |
|---|---|---|
| M1 | PayFast billing (MASTER_DIRECTION Batch 8): only the schema exists (mig 081, `billing_tier`). Wear's brand application already asks brands to agree to a monthly fee that nothing collects. | Parked |
