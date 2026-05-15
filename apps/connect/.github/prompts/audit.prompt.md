---
description: "Run the Connect Auditor on the next pending surface (no argument) or a specific surface/path you name. Use in a NEW chat session so it never interrupts active development."
agent: "Connect Auditor"
argument-hint: "Optional — surface name or path (e.g. 'rsvp-and-comments', 'src/app/api/rsvp'). Omit to audit the next highest-risk pending surface automatically."
---
Run the **Connect Auditor**.

## Instructions to the auditor

1. Execute Phase 0 (orient) as defined in your agent spec.

2. Phase 1 — pick the surface:
   - **If the user provided an argument:** resolve it to a surface in `.audit/QUEUE.md`. If it matches an existing surface, mark it `in-progress`. If it's a path or feature description with no matching entry, create a new row with a sensible name and `risk: tbd` then proceed. If the argument is ambiguous (matches multiple surfaces), pause and ask via askQuestions to pick one.
   - **If no argument was provided:** open `.audit/QUEUE.md` (seed it from the default surface list in your agent spec if it doesn't exist), pick the **highest-risk pending** surface by the risk heuristic in Phase 1 of your spec, and mark it `in-progress` immediately.

3. Execute Phases 2–8 fully on that single surface. Do not expand scope into a second surface.

4. Return the final report exactly as specified in Phase 8.

If anything blocks orientation (missing master docs, missing queue, conflicting status), stop and ask via askQuestions before touching code.
