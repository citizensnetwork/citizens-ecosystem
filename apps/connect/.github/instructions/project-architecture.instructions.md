---
applyTo: "**"
description: "Reference architecture map for Citizens Connect. Applies everywhere so any session can orient itself in the codebase."
---
# Project Architecture

## Directory Map

```
src/
├── app/                          # Next.js App Router (Server Components by default)
│   ├── api/rsvp/route.ts         # RSVP toggle API (POST, auth-gated)
│   ├── auth/callback/route.ts    # PKCE code exchange (password reset, email confirm)
│   ├── events/
│   │   ├── page.tsx              # /events — fetches all events, renders EventsView
│   │   ├── loading.tsx           # Skeleton loader for events page
│   │   ├── new/page.tsx          # /events/new — event creation (vendor-only)
│   │   └── [id]/page.tsx        # /events/[id] — event detail page
│   ├── login/
│   │   ├── page.tsx              # Email/password login
│   │   ├── forgot-password/page.tsx  # Request password reset email
│   │   └── reset-password/page.tsx   # Set new password (after email link)
│   ├── signup/page.tsx           # Registration with role selection (vendor/client)
│   ├── profile/page.tsx          # User profile, RSVPs, created events
│   ├── globals.css               # Tailwind v4 config + CSS variables + FullCalendar overrides
│   ├── layout.tsx                # Root layout with fonts, Navbar
│   ├── loading.tsx               # Global skeleton fallback
│   └── page.tsx                  # Landing page (redirects or intro)
│
├── components/
│   ├── auth/                     # Login/Signup forms (client components)
│   ├── events/
│   │   ├── EventsView.tsx        # Main app shell — map/calendar toggle, floating controls, filter drawer, detail panel
│   │   ├── EventMap.tsx → (dynamic import from map/)
│   │   ├── EventCalendar.tsx     # FullCalendar wrapper — day/week/month views
│   │   ├── EventForm.tsx         # Create event form with image upload + LocationPicker
│   │   ├── EditEventForm.tsx     # Edit event form with delete
│   │   ├── EventDetailContent.tsx# Full event detail (MiniMap, RSVP, Comments)
│   │   ├── EventCard.tsx         # Event card with image (used in lists)
│   │   ├── EventList.tsx         # Vertical event list
│   │   ├── CommentSection.tsx    # Comments with inline fetch + cancellation
│   │   └── RSVPButton.tsx        # RSVP toggle button
│   ├── map/
│   │   ├── EventMap.tsx          # Full-screen Leaflet map — clustering, category markers, temporal encoding, geolocation
│   │   ├── LocationPicker.tsx    # Click-to-place marker for event creation
│   │   └── MiniMap.tsx           # Read-only mini map for event detail
│   └── ui/
│       └── Navbar.tsx            # Sticky nav (hidden on /events for full-screen map)
│
├── lib/
│   ├── map/markers.ts            # Category icons (divIcon + emoji), temporal style calculator
│   └── supabase/
│       ├── server.ts             # Async server Supabase client (cookies)
│       └── client.ts             # Browser Supabase client
│
├── types/
│   ├── db.ts                     # Event, Profile, RSVP, Comment, EventCategory, UserRole
│   └── leaflet.markercluster.d.ts# Type declarations for markercluster plugin
│
└── middleware.ts                 # Supabase session refresh on all non-static routes

supabase/
├── schema.sql                    # Canonical full schema (idempotent)
└── migrations/
    ├── 001_add_coordinates.sql   # lat/lng columns on events
    ├── 002_add_category.sql      # category column on events
    └── 003_stage2.sql            # image_url + comments table
```

## Data Flow

1. **Server Component** (`page.tsx`) → `await createClient()` → Supabase query → passes data as props
2. **Client Component** (`"use client"`) → receives props → handles interactivity
3. **Mutations** → either form `action` or `fetch("/api/...")` → server route → `await createClient()` → Supabase

## Key Component Relationships

- `EventsView` is the app shell — it owns search, filters, view toggle, and the detail panel
- `EventMap` and `EventCalendar` both call `onSelectEvent` → opens the shared detail panel in `EventsView`
- `EventForm` embeds `LocationPicker` for lat/lng selection
- `EventDetailContent` embeds `MiniMap`, `RSVPButton`, and `CommentSection`

## Environment

- **Project path:** `C:\Users\SJ\Desktop\Businesses\citizens-connect`
- **Supabase URL:** `https://xyiajtrvhlxaeplsiajj.supabase.co`
- **Default map center:** Pretoria, South Africa `[-25.7479, 28.2293]`
- **Build command:** `& ".\node_modules\.bin\next.cmd" build 2>&1` (avoids global Next.js 16)
- **PATH fix:** `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH`
