# Phone check: serving areas, the area picker and the globe (issue 259; written 2026-10-22)

**Who:** Stephen, on the Android phone. **Time:** about 15 minutes. **Why it is on a phone:** my tests drive Chrome with real touch events and a stand-in for the database, which is the closest a computer gets, but they cannot reproduce Android Chrome's own scroll engine, your real account, or the live database. Sections A and B need a signed-in account that can **apply as a Contributor** (a Citizen who has not applied) or a Contributor with **no fixed location**. Section C (the globe) is added when the globe is built; it is not here yet.

**Before you start.** Open the live site in Chrome on the phone. The app keeps its files in a cache so it opens fast; to be sure you have the new version, close the tab, reopen the site, and if the screen still looks as before, clear the site's data (Chrome menu, Settings, Site settings, the site, Clear). This check starts once this work is **merged and live**; it is not live yet.

Tick each line. If one fails, write down the number and what you saw ("A4: ticked Eldoraigne and Centurion lit up too"), that is all I need.

## A. The area picker in the Apply wizard

Open the menu, **Become a Contributor**, step 1.

| #   | Do this                                                          | You should see                                                                                                                                       | Pass |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A1  | Look at step 1 before touching the "fixed physical location" row | The usual map and address. **No** "Where do you serve?" anywhere, and still **Step 1 of 3**                                                          |      |
| A2  | Switch on "I don't have a fixed physical location"               | The map and address go; **Where do you serve?** appears under the switch. Still **Step 1 of 3**. **No map** in the picker                            |      |
| A3  | Tap the little arrow beside **Gauteng**                          | Its cities and towns appear. **Nothing is ticked**, and the line under the list still says "Serving: nothing chosen yet"                             |      |
| A4  | Tap the arrow beside **Centurion**, then tick **Eldoraigne**     | Only Eldoraigne is ticked. **Centurion and Gauteng are not ticked**; each shows a small gold dot. The line says **Serving: Eldoraigne**              |      |
| A5  | Tick **Pretoria** (a whole city)                                 | A line under it says **Includes everything inside**, and the summary says **all of Pretoria**                                                        |      |
| A6  | Look at the box "Also reach people within a distance"            | While nothing is chosen it is greyed out with the line **Choose an area first. A distance needs a centre.** Once an area is chosen it opens          |      |
| A7  | Tap **25 km**, then untick every area                            | The distance closes by itself and says to choose an area first again                                                                                 |      |
| A8  | Tick two areas, tap **50 km**                                    | A **Measured from** list appears with your two areas (default: the most specific one)                                                                |      |
| A9  | Look at **How do people find you?**                              | Two choices: **Online** (selected) and **No fixed place**. Pick the one that is true for you                                                         |      |
| A10 | Type three letters of a town in the search box                   | A flat list of matches, each with the area it belongs to; ticking works the same                                                                     |      |
| A11 | Try to tick a 21st area                                          | A calm line says you can choose up to 20, and nothing changes                                                                                        |      |
| A12 | Check every arrow and box with your thumb                        | Each is easy to hit, none is cramped against the next                                                                                                |      |
| A13 | Go on to the last step                                           | A **Serving** row names what you chose. The note says "Online in this area: people there find you once you are approved." It never says "on the map" |      |
| A14 | Submit                                                           | You land on the "being reviewed" page, as before                                                                                                     |      |

## B. The same picker on the Dashboard

On the "being reviewed" page, or (once approved) the Dashboard, **Profile** tab, with "No fixed physical location" switched on.

| #   | Do this                                              | You should see                                                                                                           | Pass |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---- |
| B1  | Scroll to where you serve                            | **Where do you serve?** with what you chose in A, ticked                                                                 |      |
| B2  | Look at the **Save areas** button before changes     | It is greyed out (nothing changed)                                                                                       |      |
| B3  | Change one area, tap **Save areas**                  | "Saved. Your areas are updated." and the button greys out again. This is **separate** from "Save changes" / Save Profile |      |
| B4  | Close the app, open it again, come back              | Your choice is still there                                                                                               |      |
| B5  | Switch "No fixed physical location" off              | The picker goes away. (With an address and a map pin you are on the map, so the picker is not offered)                   |      |
| B6  | Turn airplane mode on, change an area, Save          | A plain message that it could not reach the server; your ticks stay on screen so you can try again                       |      |
| B7  | (If you have an editor on your team) sign in as them | They can change the areas too; a viewer sees no picker                                                                   |      |

## What I could not check from a computer

- The real Android keyboard over the search box, and how the page scrolls with your thumb on a long list.
- Whether the gold and the small dot are easy to tell apart in sunlight.
- The live seed: the areas are rough rectangles I entered by hand (Gauteng and a few towns and suburbs). If a place you serve is missing, tell me which one; the full country needs your choice of source.
