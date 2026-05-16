---
description: "Run the Connect Auditor on the next N pending surfaces (default 1) or a specific surface/path. Use in a NEW chat session so it never interrupts active development."
agent: "Connect Auditor"
argument-hint: "Optional — a count (e.g. '2' or '3'), a surface name, or a path. Omit to audit the single next highest-risk pending surface. Max 3 surfaces per run."
---
Run the **Connect Auditor**.

## Instructions to the auditor

1. Execute Phase 0 (orient) as defined in your agent spec. **Phase 0 runs once regardless of how many surfaces are requested.** This is the primary token-saving benefit of batch mode.

2. Phase 1 — determine the surface list:
   - **If the argument is a number N (1–3):** select the top N highest-risk `pending` surfaces from `.audit/QUEUE.md` using your risk heuristic. If N > 3, cap at 3 and inform the user. Only batch surfaces of the same risk tier (e.g. don't mix `critical` and `medium` in one batch — stop at the tier boundary and note what was deferred).
   - **If the argument is a surface name or path:** target that specific surface (single surface only — no count).
   - **If no argument:** audit the single next highest-risk `pending` surface (maximum quality, no batching).
   - For each surface in the list: check for an existing checkpoint and read it if present, then mark it `in-progress` in the queue.

3. Execute Phases 2–8 **sequentially** for each surface in the list:
   - Complete one surface fully (all 8 phases including its checkpoint write and QUEUE update) before starting the next.
   - **Quality gates (tsc, vitest, lint)** — run once after all Fix-clean edits across ALL surfaces in the batch rather than per surface. This reduces redundant full-suite runs.
   - If context pressure becomes apparent on surface 3 (very large file lists, deep traces), note in the checkpoint that a focused re-audit of that surface is recommended before applying its patches.

4. Return a consolidated final report covering all surfaces audited: per-surface verdict, Fix-clean count, Fix-staged patch list, and one combined apply command (e.g. `/audit-fix` if all are ready, or individual `/audit-apply <surface>` calls if some are outstanding).

If anything blocks orientation (missing master docs, conflicting queue state), stop and ask via askQuestions before touching code.
