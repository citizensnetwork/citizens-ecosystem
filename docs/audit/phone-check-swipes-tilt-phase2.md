# Phone check: swipes, tilt, Upcoming | Recent, follower counts, QR code, Nearby, pinch zoom (written 2026-10-14, extended 2026-10-15)

**Who:** Stephen, on the Android phone that showed the swipe problem. **Time:** about 10 minutes. **Why it is on a phone:** my tests drive Chrome with real touch events, which is the closest a computer gets, but Android Chrome has its own scroll engine, so this item (tracker R7, RESUME C22) is not done until a phone has passed it.

**Before you start.** Open the live site in Chrome on the phone. The app keeps its files in a cache so it opens fast; to be sure you have the new version, close the tab, reopen the site, and if the sheet still behaves as before, clear the site's data (Chrome menu, Settings, Site settings, the site, Clear and reset) and open it again. (Do not use a private tab; it hides some history behaviour.)

Tick each line. If one fails, write down the number and what you saw ("A3: the sheet moved but the page behind it scrolled"), that is all I need.

## A. Swipes on the card (R7)

Tap any Contributor's pin. The card opens at "half" (about half the screen).

| #   | Do this                                                                                   | You should see                                                                                         | Pass |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---- |
| A1  | Swipe UP with your thumb on the name at the top of the card                               | The card follows your thumb and settles at "full" (nearly the whole screen)                            |      |
| A2  | Swipe DOWN from the name                                                                  | It goes back to half                                                                                   |      |
| A3  | At half, swipe UP starting on the buttons row (Directions, Share) or on the text under it | The card goes to full. (This is the one that did not work before.)                                     |      |
| A4  | At full, with the content at the top, swipe DOWN on the content                           | The card goes down to half. (The other one that did not work.)                                         |      |
| A5  | At half, swipe DOWN on the content again                                                  | It goes to the small strip at the bottom ("peek")                                                      |      |
| A6  | At peek, swipe DOWN on the strip                                                          | The card closes                                                                                        |      |
| A7  | Open a card with a gallery or lots of content, go to full, swipe UP on the content        | The content scrolls and the card stays at full                                                         |      |
| A8  | Now swipe DOWN a little while the content is scrolled                                     | The content scrolls back; the card does NOT go down yet                                                |      |
| A9  | When the content is at the very top, swipe DOWN again                                     | Now the card goes down to half                                                                         |      |
| A10 | Start a swipe on a photo in the gallery (full), swipe down                                | Same as A9, and no photo opens by accident                                                             |      |
| A11 | Tap a photo (do not swipe)                                                                | The photo opens full screen; Back closes the photo only                                                |      |
| A12 | Flick quickly (a short fast flick)                                                        | It moves exactly one step, not two                                                                     |      |
| A13 | With the card open, press the phone's Back button once                                    | The card closes and you stay on the map (this is the Back behaviour from before; it must be unchanged) |      |
| A14 | Do the same on a Place pin and an Event pin                                               | A1 to A6 behave the same                                                                               |      |
| A15 | Turn the phone sideways (landscape), open a card, swipe up and down                       | It is the same swipe card (not a side panel); A1 to A6 work                                            |      |
| A16 | Pull the card all the way up, then try to scroll the map behind it                        | The map does not move while you are on the card                                                        |      |

## B. The tilt (R8)

| #   | Do this                                                               | You should see                                                                                            | Pass |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---- |
| B1  | Open the map                                                          | The map is tilted (the far streets look smaller), pins stand upright                                      |      |
| B2  | Drag one finger                                                       | The map pans as before                                                                                    |      |
| B3  | Pinch with two fingers                                                | It zooms as before                                                                                        |      |
| B4  | Twist with two fingers                                                | The map rotates as before                                                                                 |      |
| B5  | Put two fingers on the map and drag them UP, then DOWN                | **Nothing tilts**: the angle stays the same                                                               |      |
| B6  | Tap a pin                                                             | The pin lifts clear above the card (it is not hidden behind it)                                           |      |
| B7  | Is the tilt too much, or hard to read in the busy middle of the city? | Tell me. The angle is one number (now 45, your pick of 2026-10-15); 0 turns it off, 60 was the first pick |      |
| B8  | Add `?map=v1` to the address, once                                    | The old flat map (this is the escape hatch; add `?map=v2` to come back)                                   |      |

## C. New in the card

| #   | Do this                                                               | You should see                                                                                                                                                                          | Pass |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| C1  | Open a Contributor that has events, tap the Events tab                | Two buttons under the tab: Upcoming (selected) and Recent                                                                                                                               |      |
| C2  | Tap Recent                                                            | Past events, newest first, each with "3 days ago" style text                                                                                                                            |      |
| C3  | Look at the line under the name of a Contributor with many followers  | "100+ followers" (or 250+, 500+, 1,000+...). A Contributor with fewer than 100 shows nothing                                                                                            |      |
| C4  | Go to full, scroll to the bottom of a Contributor card, tap "QR code" | A white card with a QR code and the link to the listing                                                                                                                                 |      |
| C5  | Scan that QR code with another phone's camera                         | It opens that Contributor's listing on the public site                                                                                                                                  |      |
| C6  | Tap "Save image"                                                      | A picture file is saved (it may land in Downloads); Back or Close closes the card. **In the phone app (not the website) there is no Save button: it says to take a screenshot instead** |      |

## D. Nearby (P2-01, new 2026-10-15)

| #   | Do this                                                         | You should see                                                                                                    | Pass |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---- |
| D1  | Open any pin, pull the card to full, scroll to the bottom       | A "Nearby" heading and up to 8 listings with how far away each is ("350 m away"), nearest first                   |      |
| D2  | Look at the list                                                | Contributors, Places and Events are mixed by distance; it never puts a big ministry above a nearer small one      |      |
| D3  | Swipe on the list (down, then up)                               | The content scrolls; no row opens by accident; the card does not collapse until you are at the top and swipe down |      |
| D4  | Tap a row                                                       | The card shows that listing, back at half, and the map moves so its pin is clear above the card                   |      |
| D5  | Press the phone's Back button once                              | The whole card closes (one press, however many listings you hopped through)                                       |      |
| D6  | Is the QR code button (bottom of the card) easy enough to find? | Tell me. It only shows at full, below the content; I can move it up if it is hidden                               |      |

## E. Pinch zoom (R9, new 2026-10-15)

| #   | Do this                                                                 | You should see                                                                                                             | Pass |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---- |
| E1  | In Chrome on the website, open Settings or a profile page and pinch out | The page zooms in; pinch in or double-tap to come back                                                                     |      |
| E2  | On the map, pinch out                                                   | The MAP zooms, the page around it does not                                                                                 |      |
| E3  | With a card open (half, then full), pinch on the card                   | The page does not zoom and the card stays where it is                                                                      |      |
| E4  | In the phone APP (not Chrome), pinch a profile page                     | It must NOT zoom (the app keeps the old behaviour until you have tested it). If it zooms, tell me: that part is unverified |      |

## F. "On the map" only when true (C21, new 2026-10-15)

| #   | Do this                                                                                                                              | You should see                                                                                                                          | Pass |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| F1  | Admin: Applications, open a pending application that has NO map pin (online-only), tap Approve                                       | The line says it puts them in Kingdom Discovery and that they have no map pin; the toast afterwards agrees                              |      |
| F2  | Approve (or create) a listing that has a pin                                                                                         | It says on the map and in Kingdom Discovery                                                                                             |      |
| F3  | The applicant's "being reviewed" banner, for an online-only application                                                              | "...goes into Kingdom Discovery once approved", not the map                                                                             |      |
| F4  | **Your step:** paste the updated `tools/google-forms/intake.gs` into the live Apps Script, then approve one test row with no address | The welcome email says "in Kingdom Discovery" for it. Until you paste it, the Form's welcome email still says "on the map" for everyone |      |

## What to send me

"All passed" or the numbers that failed with one line each. For A and B failures, a screen recording (your phone's own recorder) is worth more than words.

## If something is wrong and it cannot wait

- The tilt only: one number, `PITCH` in `apps/connect/src/frontend/app/map-v2-lib.jsx`: set it to `0` and everything behaves as it did before the tilt (flat start, two-finger tilt allowed).
- The whole new map: `DEFAULT_ON = false` in the same file.
- Everything in this change: revert the pull request that carried it (the pull request number is in `apps/connect/RESUME_HERE.md`, section 6, top entry).
