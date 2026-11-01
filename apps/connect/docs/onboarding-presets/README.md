# Onboarding presets (#202): the Design spec, built and measured

Proof for the seven changes in the Design spec posted on issue #202 (2026-11-01). Light only: the Apply wizard has no dark
look yet (it is Connect's older Tailwind look, and the Admin queue shares it). Fixture data only, captured with a throwaway
Playwright script against the hermetic fake project (`e2e/support/fake-project`); nothing here is real.

Screenshots: `wizard-1-care-map-off-{375,768,1280}.png` (Clinic picked, map off), `wizard-2-care-map-on-{375,768,1280}.png`
(map switch on, address field back), `wizard-3-review-care-map-off-{375,768,1280}.png` (step 3), `admin-stacked-card-{375,768,1280}.png`
(an application that was previously removed AND is Care / Recovery). The round menu button that overlaps the bottom of a
card is the app's floating menu, not part of the card.

## Measured (same at 375, 768 and 1280 unless a width is named)

| Spec change | Measured |
| --- | --- |
| 1. Copy promises only what is built | Care note ends "...until they approve it." (no "up to you") |
| 2. Note text contrast | Note words 17:1 at 12 px (were 4.35:1 gold text on the fill); the icon keeps the gold ink. Review note 17:1 too |
| 3. Map switch vs "no fixed location" | "No fixed location" answered first, then a Care type: the switch is gone (0 found) and so it is with the map on. Back to a non-Care type it returns, off |
| 4. Review step | "Clinic · Not on the map", row "On the map: No. We store no address or pin."; the literal word "Category" appears 0 times; a Church shows "Church · <address>" |
| 5. Type follows the category | Business gives `business`; Market / Expo then gives `ministry` with no hint; a Type the person picked is never changed (e2e) |
| 6. Announced | The note sits in a polite live region that is in the page before it appears; the switch is in the named group "Area / location served" and outside the live region; the Type sentence has its own live region |
| 7. Admin note | Heading "Extra review: care or recovery", 12 px, no uppercase; shield icon next to the flag on the "previously removed" note (the two SVGs differ); body 6.37:1 |

Also measured: the map switch is 343 x 53 px at 375 (44 px minimum) and `role="switch"`; tapping Clinic moves the tapped
category 16 px; an empty note slot takes no room (0 px), so rows below it sit where they always did.

Not in this change (see the spec's out-of-scope list): the shared Toggle's 11 px description, the pending-application and
Dashboard location editors, per-item public choice, a safeguarding contact, a dark look for the wizard.
