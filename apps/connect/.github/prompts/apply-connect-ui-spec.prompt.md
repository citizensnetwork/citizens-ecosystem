---
description: "Apply Citizens Connect UI system and map-first UX exactly (white/black/gold, floating controls, full-screen events map)"
agent: "UI"
argument-hint: "Target pages/components and any additional style request"
---
Implement or refactor the requested UI using the Citizens Connect UI system.

## Non-Negotiables

- Keep visual ratio: 60% white, 30% black, 10% gold
- Keep `/events` map view full-screen and map-first
- Keep floating controls in map view (search, title chip, burger filters, calendar toggle)
- Preserve existing validation and business behavior
- Keep mobile-first responsiveness

## Task Flow

1. Audit the target components first.
2. Implement changes in code (not recommendations only).
3. Reuse existing tokens/utilities from `src/app/globals.css` when possible.
4. Validate with lint/type-check when relevant.

## Response Format

### What I Implemented
- Concrete UI changes made.

### Design Coverage
- Checklist for each requested design element.

### Files Updated
- Paths and one-line summary per file.

### Validation
- What was tested and any remaining risk.
