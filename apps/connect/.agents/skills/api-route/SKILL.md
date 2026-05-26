---
name: api-route
description: >
  Next.js App Router API route conventions for Citizens Connect.
  Auto-loads when creating or modifying src/app/api/ route handlers.
---

# API Route Skill — Citizens Connect

## Route Template
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimiter, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // 1. Rate limit
  const limit = await rateLimiter(request, RATE_LIMITS.mutation);
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  // 2. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 3. Validate input
  const body = await request.json();
  const text = body.text?.trim();
  if (!text || text.length < 1 || text.length > 500) {
    return NextResponse.json({ error: "Invalid input" }, { status: 422 });
  }

  // 4. UUID validation
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(body.targetId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 422 });
  }

  // 5. DB op — explicit columns, not wildcards
  const { data, error } = await supabase
    .from("my_table")
    .insert({ user_id: user.id, text, target_id: body.targetId })
    .select("id, text, created_at")
    .single();

  if (error) {
    console.error("[api/my-route]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
```

## Rate Limit Constants
- `RATE_LIMITS.mutation` — 50/min/user (standard writes)
- `RATE_LIMITS.message` — 30/min/user
- `RATE_LIMITS.auth` — 10/min/ip
- `RATE_LIMITS.heavy` — 5/min/user

## Error Conventions
- 401 Unauthorized, 403 Forbidden, 409 Conflict + `code` field,
  422 Invalid input, 429 Too many requests + `Retry-After`, 500 Internal server error

## Test Requirements
Min 3 tests per route: 401 unauth, happy path, error case.
