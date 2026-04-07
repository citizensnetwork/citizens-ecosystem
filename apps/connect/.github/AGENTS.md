# Citizens Connect Agent Operating Contract

This repository is conversation-safe by design. Any chat can be deleted and rebuilt from files in `.github/`.

## Startup Protocol (every session)

1. Read `.github/PROJECT_STATUS.md`.
2. Read `.github/DECISIONS.md`.
3. Read `.github/copilot-instructions.md`.
4. If the task touches architecture, UI, maps, or Supabase, load the matching instruction file in `.github/instructions/`.
5. After implementing changes, update status/decision docs if anything meaningful changed.

## Persistence Rules

- Never store secrets in `.github/` docs.
- Keep secrets in `.env.local` only.
- Keep `PROJECT_STATUS.md` as the source of truth for progress.
- Keep `DECISIONS.md` as the source of truth for technical rationale.

## Definition of Done for Any Significant Task

- Code is implemented.
- Build or type check is run when relevant.
- `PROJECT_STATUS.md` reflects new progress.
- `DECISIONS.md` records any new technical decision.
- Any reusable workflow is captured as a prompt or agent in `.github/`.

---

## Agent Registry (12 agents)

### Core Technical Agents

| Agent | File | Tools | Purpose |
|-------|------|-------|---------|
| **Architect** | `architect.agent.md` | read, search | Architecture, code quality, security, API design review. Read-only. Replaces code-quality-review. |
| **Testing** | `testing.agent.md` | read, search, edit, execute | Write/run tests (Vitest + Playwright), generate fixtures, identify coverage gaps. |
| **Refactor** | `refactor.agent.md` | read, search, edit, execute | Clean code, enforce patterns, extract utilities. Never changes behavior. |
| **Data** | `data.agent.md` | read, search, edit, execute | Seed data, query performance analysis, index recommendations, data migration planning. |
| **Notification** | `notification.agent.md` | read, search, edit, execute | Notification templates, Edge Functions, push delivery, frequency/digest management. |

### Product & Content Agents

| Agent | File | Tools | Purpose |
|-------|------|-------|---------|
| **Product Lead** | `product-lead.agent.md` | read, search, edit | Roadmap alignment, feature specs, scope control, progress tracking. |
| **Community** | `community.agent.md` | read, search, edit | Content strategy, categories, onboarding copy, SEO/OG meta, brand voice. |

### UI Agents

| Agent | File | Tools | Purpose |
|-------|------|-------|---------|
| **UI** | `ui.agent.md` | read, search, edit, execute | Frontend implementation — layout, interactions, visual polish. |
| **UI Consistency Review** | `ui-consistency-review.agent.md` | read, search | Read-only UI compliance audit against brand system. |

### Growth & Conversion Agents

| Agent | File | Tools | Purpose |
|-------|------|-------|---------|
| **InviteFlow Architect** | `invite-flow.agent.md` | read, search, edit, execute | Event invite generation, share templates, channel-optimized formatting, RSVP conversion. |

### Infrastructure Agents

| Agent | File | Tools | Purpose |
|-------|------|-------|---------|
| **Schema Architect** | `schema-architect.agent.md` | read, search | Read-only DB schema advisor — reviews tables, RLS, migrations. |
| **Continuity Manager** | `continuity-manager.agent.md` | read, search, edit, execute | Context reconstruction, session persistence, end-to-end execution. |

### Deferred

| Agent | Trigger to Create |
|-------|-------------------|
| **Operations** | First 100 real users or first content moderation incident |

---

## Agent Invocation Guide

| Task | Agent(s) |
|------|----------|
| "Review my code" / "Is this well-structured?" | **Architect** |
| "Write tests for X" / "What's untested?" | **Testing** |
| "Clean up this file" / "Reduce duplication" | **Refactor** |
| "Seed test data" / "Find slow queries" | **Data** |
| "Design notification for X" / "Build push system" | **Notification** |
| "Does this feature fit the roadmap?" | **Product Lead** |
| "Review onboarding copy" / "Suggest categories" | **Community** |
| "Improve the UI of X" / "Make this look better" | **UI** |
| "Does this follow the design system?" | **UI Consistency Review** |
| "Review this schema change" | **Schema Architect** |
| "Resume where we left off" | **Continuity Manager** |
| "Generate WhatsApp invite" / "Optimize share flow" | **InviteFlow Architect** |

---

## Multi-Agent Workflows

Common task flows that involve multiple agents in sequence:

### Adding a New Feature
1. **Product Lead** — evaluate fit, generate spec
2. **Schema Architect** — review data model (if DB changes needed)
3. Default agent or **UI** — implement the feature
4. **Architect** — review the implementation
5. **Testing** — write tests
6. **Continuity Manager** — update PROJECT_STATUS.md

### Optimizing Event Sharing
1. **InviteFlow Architect** — design templates, build share components
2. **UI** — polish share sheet and invite preview
3. **Notification** — wire share-triggered notifications (if applicable)
4. **Data** — seed test events for share testing
5. **Architect** — review for security (XSS in templates, deep link safety)

### Code Health Check
1. **Architect** — full codebase review (architecture + security + quality)
2. **UI Consistency Review** — UI compliance audit
3. **Refactor** — fix issues identified by Architect
4. **Testing** — add tests for previously untested paths

### Pre-Release Audit
1. **Architect** — security + performance review
2. **Testing** — run full test suite, identify gaps
3. **Data** — verify indexes and query performance
4. **Community** — review public-facing content and SEO
