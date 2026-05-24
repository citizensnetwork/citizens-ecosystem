# Reporting System — Feature Clarity

> **Status:** Core reporting is fully implemented. Several gaps need design input
> before the feature can be considered complete.

---

## What exists right now

| Area | Status |
|------|--------|
| `reports` table (reporter_id, target_type, target_id, reason, body, status) | ✅ Live |
| `ReportButton` component (event / place / user targets) | ✅ Live |
| `POST /api/reports` — file a report (rate-limited: 5/user/hour) | ✅ Live |
| Deduplication: one open report per (user, target) via partial unique index | ✅ Live |
| `GET /api/reports` — viewer sees their own filed reports | ✅ Live |
| `/admin/reported` page — admin can view open/resolved reports | ✅ Live |
| `PATCH /api/admin/reports/[id]` — admin resolves report (logs to admin_actions) | ✅ Live |
| Admin notification (push/email) when a new report is filed | ❌ Missing |
| Reporter notification when their report is resolved | ❌ Missing |
| Contributor-facing moderation queue (their events/places reported) | ❌ Missing |
| Auto-action on threshold (e.g. hide after 5 reports) | ❌ Missing |
| Report reason taxonomy (is "reason" a free-text field or an enum?) | ❓ Unclear |

---

## Questions

### 1. Report reason taxonomy
- Should users pick from a predefined list (e.g. Spam, Inappropriate, Misleading, Harassment)?
- Or is it free-text only?
- Or both (pick a category + optional description)?

### 2. Admin notification on new report
- Should admins receive a push notification the moment a report is filed?
- Or a daily digest of new reports?
- Which admins should be notified (all admins? only the primary admin)?

### 3. Reporter follow-up
- Should the reporter receive a notification when their report is:
  - Actioned (content removed / user warned)?
  - Dismissed (no action taken)?
- What message should they receive in each case?

### 4. Contributor-facing moderation
- Should a Contributor be notified when one of their events or places is reported?
- Should they be able to respond / appeal before the admin reviews?
- Or is this admin-only?

### 5. Auto-action threshold
- After N reports on the same target (e.g. 5 reports), should the platform
  automatically hide the content pending admin review?
- What is N?
- Does auto-hide notify the content owner?

### 6. Report escalation
- If an admin marks a report as "actioned", is there a further escalation path
  (e.g. legal, platform abuse team)?
- Should severe reports (CSAM, threats) have a separate fast-track queue?

### 7. Repeated offenders
- After N reports filed against the same user, should their account be flagged,
  suspended, or banned automatically?
- Who reviews and approves the suspension?

### 8. False reports
- Can a user be penalised for filing bad-faith / repeated false reports?
- Is there a "this report was dismissed" counter per user?

### 9. Anonymous reports
- Should unauthenticated users be able to file a report?
- If yes, how do you prevent abuse (anonymous spam reports)?

### 10. Visibility of report status to the reporter
- On the reporter's `/reports` list, can they see if their report is open, actioned, or dismissed?
- Should they see the admin's resolution note?

---

## Gaps to implement (once design decisions are made)

1. Admin push/email notification on new report
2. Reporter notification (push + in-app) on resolution with outcome label
3. Auto-hide threshold (configurable via feature flag)
4. Contributor notification when their content is reported (without revealing the reporter)
5. Reason taxonomy enum — add to `reports` table and `ReportButton` UI

---

## Decision log

*Fill in as answers are given.*

| Question | Decision | Date |
|----------|----------|------|
| | | |
