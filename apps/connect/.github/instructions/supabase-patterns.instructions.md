---
applyTo: "src/lib/supabase/**,src/app/api/**,src/app/**/page.tsx"
description: "Use when editing data-fetching code, API routes, or Supabase interactions. Enforces dual-client pattern, RLS conventions, and storage rules."
---
# Supabase Data Patterns

## Dual-Client Rule

Two Supabase clients exist. Using the wrong one causes auth failures or hydration mismatches.

| Context | Import | Returns |
|---------|--------|---------|
| Server Component, Route Handler, Server Action | `import { createClient } from "@/lib/supabase/server"` | `await createClient()` (async) |
| Client Component (`"use client"`) | `import { createClient } from "@/lib/supabase/client"` | `createClient()` (sync) |

**Never** import the server client in a `"use client"` file or vice versa.

## Data Fetching in Server Components

```tsx
// src/app/some-page/page.tsx (Server Component — no "use client")
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("*");
  return <ClientComponent events={data ?? []} />;
}
```

## Data Fetching in Client Components

Use `useEffect` with a cancellation flag for client-side fetches:

```tsx
useEffect(() => {
  let cancelled = false;
  const supabase = createClient();
  supabase.from("table").select("*").then(({ data }) => {
    if (!cancelled && data) setState(data);
  });
  return () => { cancelled = true; };
}, [deps]);
```

## API Routes

```tsx
// src/app/api/example/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ... business logic
}
```

## RLS Policy Standards

Every table must have Row Level Security enabled. Minimum policies:

- **SELECT**: `using (true)` for public data, `using (auth.uid() = user_id)` for private
- **INSERT**: `with check (auth.uid() = <owner_column>)`
- **UPDATE/DELETE**: `using (auth.uid() = <owner_column>)`

The anon key is safe to expose — RLS enforces access. Never bypass RLS with the service role key in client code.

## Storage

- Bucket `event-images` is public
- Upload path convention: `${user.id}/${Date.now()}.${ext}`
- Get URLs via: `supabase.storage.from("event-images").getPublicUrl(path)`
- Supabase storage domain is registered in `next.config.ts` for `next/image`

## Migrations

- Place in `supabase/migrations/NNN_description.sql`
- Must be **idempotent** (safe to re-run): use `IF NOT EXISTS`, `DO $$ BEGIN ... END $$`
- After creating a migration, update `supabase/schema.sql` to match (canonical full schema)
- After schema changes, update `src/types/db.ts` with matching TypeScript types
