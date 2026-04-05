---
description: "Scaffold a complete end-to-end feature: migration SQL, TypeScript types, server data fetch, client component, and route wiring"
agent: "agent"
argument-hint: "Feature name and description, e.g. 'Event bookmarks — users can save events to a personal list'"
---
Implement a complete end-to-end feature for Citizens Connect. Follow ALL existing patterns exactly.

## Input

The user will describe a feature. Parse it and generate ALL necessary artifacts.

## Checklist — Generate Each Layer

### 1. Database (if needed)
- [ ] Migration SQL in `supabase/migrations/NNN_<feature>.sql` (idempotent)
- [ ] Update `supabase/schema.sql` with the new table/columns
- [ ] Add TypeScript type to `src/types/db.ts`
- [ ] RLS policies (SELECT/INSERT/UPDATE/DELETE as appropriate)

### 2. Server Data Layer
- [ ] Server Component page in `src/app/<route>/page.tsx` that fetches data via `await createClient()` from `@/lib/supabase/server`
- [ ] API route in `src/app/api/<feature>/route.ts` if client-side mutations are needed

### 3. Client Components
- [ ] Component(s) in `src/components/<feature>/` with `"use client"`
- [ ] Follow UI system: 60/30/10 white-black-gold, CSS variables from globals.css
- [ ] Mobile-first responsive design
- [ ] Loading states using skeleton pattern
- [ ] Proper error handling for user-facing operations

### 4. Integration
- [ ] Wire the new page/component into existing navigation or views
- [ ] If map-related: use raw Leaflet pattern (useEffect/useRef/map.remove), dynamic import with `ssr: false`
- [ ] If Supabase Storage: follow upload path convention `${user.id}/${timestamp}.ext`

### 5. Validation
- [ ] Run `npx tsc --noEmit` to verify types
- [ ] Run build to verify compilation
- [ ] List any manual steps (run migration, configure storage bucket, etc.)

## Conventions Reference

- **Server client**: `const supabase = await createClient()` (from `@/lib/supabase/server`)
- **Client client**: `const supabase = createClient()` (from `@/lib/supabase/client`)
- **Next.js 15 params**: `const { id } = await params` (params is a Promise)
- **Categories**: church-service, youth, community-outreach, worship, bible-study, prayer, social, other
- **Roles**: vendor (can create/edit events), client (can RSVP/comment)
- **Map components**: raw Leaflet only, no react-leaflet
- **CSS**: Tailwind v4 with CSS variables, no tailwind.config file

## Output Format

### Files Created/Updated
Path and one-line description for each file.

### Manual Steps
Any actions needed outside code (run migration, configure Supabase, etc.).

### Testing Checklist
How to verify the feature works end-to-end.
