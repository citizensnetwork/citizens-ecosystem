# Confirm an intake upgrade — design note

Issue #248 has no design spec. This screen follows `docs/DESIGN_SYSTEM.md` as far as the app shell allows.

## What the person sees

One page, `Confirm your listing`. A card in the existing shell:

- A line that nothing is public yet.
- Category: an 8px dot in the category colour already used by the shell, plus the category name in words. If there is no category, the kind word is shown.
- The organisation name.
- The area, or "Online / no fixed location".
- Up to three lines of the bio.
- When the link expires.
- Two actions, each at least 44px tall: **Confirm upgrade** (gold) and **Not mine** (outline). On the decline link, Not mine is first and focused.

Loading uses the shell's pulse placeholders. Errors are a sentence plus **Try again**.

## Deviations

1. The screen uses the shell's existing card and button classes (`bg-card`, `border-border`, `Button`), not map v2 token CSS. That stylesheet loads with the map. A shell page has to keep working when it does not.
2. Confirm and Not mine are buttons on a signed-in page. The email links only open the page, so a mail program cannot change the account by fetching the link.
3. The shell has one look. Map v2's dark theme does not restyle these pages, so the dark screenshots match the light ones.
4. The category dot uses the hex already returned by `DATA.getContributorType` (the same value the rest of the shell uses), with the name in text beside it.

Screenshots: `apps/connect/docs/handoffs/intake-upgrade/` at 375, 768 and 1280, light and dark.
