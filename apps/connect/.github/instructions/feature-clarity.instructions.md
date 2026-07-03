---
applyTo: "src/app/messages/**,src/components/messaging/**,src/app/c/**,src/components/contributor/**,src/app/events/**,src/app/profile/**,src/components/social/**"
description: "Feature-clarity doc routing for Citizens Connect. Auto-loads when editing feature-area source files to point agents at the correct spec before writing code."
---
# Feature-Clarity Routing

Before writing code in any of these areas, read the authoritative spec. PRs that contradict a clarity doc must update the doc in the same commit.

| Feature area | Files | Spec |
|---|---|---|
| Direct messaging | `src/app/messages/**`, `src/components/messaging/**` | `docs/feature-clarity/messaging.md` |
| Friends / follows / social graph | `src/components/social/**`, `src/app/profile/**` | `docs/feature-clarity/friends.md` |
| Search & AI discovery | `src/components/events/EventsView.tsx`, `src/lib/aiSearch*.ts` | `docs/feature-clarity/search-and-discovery.md` |
| Reporting / moderation | anywhere a "report" flow is touched | `docs/feature-clarity/reporting.md` |
| Dynamic surfaces (broadcasts, announcements) | `src/app/c/**/broadcasts/**` | `docs/feature-clarity/dynamic-surfaces.md` |
| Contributor dashboard (all stages) | `src/app/c/**/dashboard/**`, `src/components/contributor/**` | `docs/plans/contributor-dashboard.md` |
