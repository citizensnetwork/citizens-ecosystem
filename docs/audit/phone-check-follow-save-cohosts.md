# Phone check: Follow, Save, co-hosts, "0 followers", zoom in the full card (written 2026-10-17)

**Who:** Stephen, on the Android phone, signed in. **Time:** about 12 minutes. **Why it is on a phone:** my tests drive Chrome with real touch events and a stand-in for the database, which is the closest a computer gets, but they cannot reproduce Android Chrome's own scroll engine, your real account, or the live database. Section C needs **two Contributor accounts** (an organiser and a guest); if you only have one, skip it and tell me, and I will say it was only tested against a stand-in.

**Before you start.** Open the live site in Chrome on the phone. The app keeps its files in a cache so it opens fast; to be sure you have the new version, close the tab, reopen the site, and if the card still looks as before, clear the site's data (Chrome menu, Settings, Site settings, the site, Clear). This check starts once this work is **merged and live**; it is not live yet.

Tick each line. If one fails, write down the number and what you saw ("B4: tapped Save, it said Saved but Settings was empty"), that is all I need.

## A. Follow on the card

Tap any **other** Contributor's pin. The card opens at half.

| #   | Do this                                                     | You should see                                                                                      | Pass |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---- |
| A1  | Look at the row of buttons under the name                   | Directions, **Follow**, **Save**, Share (and Website, Call or Email when the Contributor has them)  |      |
| A2  | Tap Follow                                                  | It says **Following**, the heart is filled, and a message says "Now following ..."                  |      |
| A3  | Close the app completely, open it again, open the same card | It still says Following                                                                             |      |
| A4  | Tap Following                                               | It goes back to Follow ("Unfollowed ...")                                                           |      |
| A5  | Tap your **own** Contributor pin (if you have one)          | There is **no** Follow and **no** Save on your own card                                             |      |
| A6  | Sign out, then browse as a guest and tap Follow on any card | A message says **"Sign in to follow."** and nothing changes (it used to show a heart that vanished) |      |
| A7  | Tap a Place pin                                             | The buttons row has Save but no Follow; the card below still has its own Follow button              |      |
| A8  | Tap an Event pin                                            | Neither Save nor Follow in the buttons row (an Event keeps Connect and Consider on its card)        |      |

## B. Save (private)

| #   | Do this                                                             | You should see                                                                                            | Pass |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---- |
| B1  | On a Contributor's card, tap Save                                   | It says **Saved**, the bookmark is filled, a message says "Saved ... Only you can see this."              |      |
| B2  | Tap Follow on the same card                                         | Follow changes and Save does **not** (they are two separate things)                                       |      |
| B3  | Save one Place too. Then open Settings (your account menu)          | A **Saved** section lists both by name, in alphabetical order, with the line "Only you can see this list" |      |
| B4  | Close the app, open it again, open Settings                         | The list is still there (it is kept in the database, not on the phone)                                    |      |
| B5  | Tap a name in the list                                              | It opens that profile                                                                                     |      |
| B6  | Tap the X beside one                                                | It leaves the list; on its card it says Save again                                                        |      |
| B7  | (If you have a second account) sign in as it and open Settings      | Its Saved list is empty: nobody sees anyone else's saves                                                  |      |
| B8  | Open a Contributor you saved, as that Contributor (their Dashboard) | Nothing anywhere says who saved them or how many people did                                               |      |

## C. Co-hosted events (two Contributor accounts: A organises, B is invited)

| #   | Do this                                                      | You should see                                                                                    | Pass |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---- |
| C1  | As A: Dashboard, Events, open an event's **Co-hosts** button | A panel opens: "Co-hosts (0 of 3)", a search box, and a line saying they get an invitation        |      |
| C2  | Type two letters of B's name                                 | B appears (you never appear in your own search)                                                   |      |
| C3  | Tap **Invite** beside B                                      | "Invitation sent to B." and B is listed as **Invited** with a Withdraw button                     |      |
| C4  | As B: open Notifications                                     | "Co-host invitation" with **Accept** and **Decline** buttons                                      |      |
| C5  | Tap Accept                                                   | The buttons become "You are co-hosting this event."                                               |      |
| C6  | As B: tap B's own pin and look at the Events tab             | The event is listed, with the line **With A** under it                                            |      |
| C7  | As A: look at A's own pin, Events tab                        | The same event, with the line **With B**                                                          |      |
| C8  | Tap the event's pin, then look at its card                   | A line "with B" (a link to B's profile). Open the full event page: a "Co-host" row for B          |      |
| C9  | As A: Co-hosts again, tap **Remove** beside B                | B leaves the list; the event is no longer on B's page                                             |      |
| C10 | Invite three people, then try a fourth                       | The search box is replaced by "This event has all 3 co-hosts. Remove one to invite someone else." |      |
| C11 | As B, decline an invitation instead                          | "You declined this invitation." and the event never appears on B's page                           |      |

## D. "0 followers" is gone

| #   | Do this                                                    | You should see                                                                  | Pass |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ---- |
| D1  | Open a Place card and a Place's full page                  | No "0 followers" anywhere (it used to say it under every small place)           |      |
| D2  | Open a Contributor's full profile                          | No "0 followers" beside the category                                            |      |
| D3  | A big Contributor (100 or more followers), if you know one | The sheet says "100+ followers" (a rounded-down figure), never the exact number |      |

## E. Zoom in the full card

| #   | Do this                                                                 | You should see                                                                                             | Pass |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| E1  | Pull a card to full. Put two fingers on its text and spread them        | **The page zooms in** (it did not before: the card swallowed the pinch)                                    |      |
| E2  | Pinch back out to normal                                                | The page returns to normal size and the card is still open at full                                         |      |
| E3  | With the page at normal size, scroll the card's content with one finger | It scrolls as before                                                                                       |      |
| E4  | At the top of the content, swipe down with one finger                   | The card still goes down to half (the hand-off from before is unchanged)                                   |      |
| E5  | At half or peek, put two fingers on the card and spread them            | Nothing zooms (the card owns the gesture there; pull it to full to zoom). Tell me if you want this changed |      |
| E6  | **Inside the phone app** (not Chrome), pinch anywhere                   | Still no page zoom in the app (E4 of the earlier check; this must be unchanged)                            |      |

## What I could not check, and why

- **Your real account and the live database.** Everything above was tested against a stand-in for the database (the exact requests, the rollbacks, the 500-save ceiling, the invitation answers), and the two database changes were probed against the live tables with throwaway users that were rolled back. Nothing has been tried with your own account.
- **Android Chrome's scroll engine and the Capacitor phone app** (E1 to E6 in particular).
- **The Notifications screen on a live invitation:** tested with a stand-in session, never with a live invitation. C4 and C5 are the first time that happens for real.
