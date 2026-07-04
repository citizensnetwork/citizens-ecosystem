# Search & Discovery — Feature Clarity

> **Status:** The burger-menu filter drawer has two tabs: Events and Places.
> The user wants to add a Contributors tab and a general search bar above the
> results. Several design decisions are needed before implementation.

---

## What exists right now

| Area | Status |
|------|--------|
| Burger-menu filter drawer with Events / Places icon tabs | ✅ Live |
| AI-ranked free-text search bar (bottom of events view) | ✅ Live |
| Contributor chips surfaced in search results when intent is detected | ✅ Live |
| Contributor type label on profile — now clickable, routes to `/events?q=[type]` | ✅ Shipped |
| `?q=` URL param pre-populates the search bar on the events page | ✅ Shipped |
| Organisation search panel (pg_trgm typo-tolerant) | ✅ Live (`searchMode = "organisations"`) |
| Dedicated Contributors tab in the burger menu | ❌ Missing |
| Search bar inside the burger-menu drawer | ❌ Missing |

---

## Questions

### 1. Contributors tab — what is it?
- Is the Contributors tab a list of all approved contributors, filterable by type
  (Ministry / Organisation / Business)?
- Or is it a search-only panel — type a name and get matching contributors?
- Or both (browseable list + search within the tab)?

### 2. Contributors tab — data source
- The events page already loads up to 200 contributor profiles for search ranking.
- Is 200 enough for a full "browse contributors" experience, or do we need pagination?
- Should contributors be sorted by: followers, proximity, creation date, or A-Z?

### 3. Contributor kind filter inside the tab
- Should there be sub-tabs or pill filters for "Ministry / Organisation / Business"?
- Or is a single search bar sufficient?

### 4. Search bar inside the burger drawer
- Currently the drawer has category/type icon buttons but no text input.
- Should the search bar be added above the category icons?
- Should it filter the list in the current tab, or should it be a global search that
  overrides all tabs and shows mixed results?

### 5. Search bar UX
- Should the search auto-correct typos (the pg_trgm engine supports this)?
- Should search results auto-update as the user types (debounced), or only on submit?
- Should there be a clear-button inside the input?

### 6. Category type → search flow (already partially implemented)
- Clicking "Ministry" on a contributor profile now routes to `/events?q=Ministry`.
- The events search ranks contributors first when "Ministry" is the query.
- Is this the right experience, or should it navigate to a dedicated `/contributors?type=ministry` page?
- If a dedicated page: is it in scope now, or later?

### 7. Contributor profile cards in search results
- When contributors appear in search results (bottom search bar), they show as
  small chips. Should they be larger cards with avatar + follower count?
- Should upcoming events be shown inline on the contributor chip/card?

### 8. Empty states
- When the Contributors tab has no results for a search query, what copy/CTA shows?
- Should it suggest checking spelling, or suggest related contributors?

### 9. Tab persistence
- If the user switches to the Contributors tab, searches, then closes the drawer,
  should the state be preserved when they re-open the drawer?
- Or should the drawer always reset to the Events tab?

### 10. Mobile UX
- On mobile the burger drawer is full-width. With three tabs + a search bar, is
  there enough vertical space without scrolling just to see filters?
- Should the tab icons be replaced with text labels on mobile to avoid confusion?

### 11. "Near me" scoping in Contributors tab
- If the user has granted location, should the Contributors tab default to showing
  contributors near their location?
- Or is contributors always shown as a global list?

### 12. Future: Place + Contributor combined cards
- Some places are owned by contributors. Should a contributor's place appear on
  their contributor card in the tab, or are they always separate?

---

## Implementation notes

Once design decisions are made, the implementation requires:
1. Add `"contributors"` to `BurgerTab` type in `BurgerMenu.tsx`
2. Add a third icon tab button (people/group icon)
3. Build `ContributorsFilterPanel` component (list + search + kind filter)
4. Feed the existing `contributors` prop (already loaded on the events page) into the panel
5. Consider adding a search `<input>` at the top of the drawer (above the tabs)

---

## Decision log

*Fill in as answers are given.*

| Question | Decision | Date |
|----------|----------|------|
| | | |
