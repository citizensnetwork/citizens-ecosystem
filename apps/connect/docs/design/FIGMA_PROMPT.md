# Citizens Connect — Figma Make Design Prompt

> Use this as a single prompt in Figma Make to generate the full design system and all pages for Citizens Connect.

---

## PROMPT

Design a complete, production-ready UI for **Citizens Connect** — a map-first Christian community discovery platform (South Africa focus, global ambition). The app helps believers find faith-based events, places, and community organisations near them on a live interactive map.

**Slogan:** "Connecting the Kingdom" (Ephesians 2:19)

---

### DESIGN LANGUAGE

**Style:** Glassmorphism — frosted glass panels, subtle transparency, soft blur backdrops, warm golden accents. The overall feeling should be spiritually grounded, warm, trustworthy, and modern. Transparency = trust. Gold = hope and royalty.

**Colour palette (strict 60/30/10):**
- 60% White/Off-white: `#FAFAF7` (backgrounds, map canvas, card bodies)
- 30% Near-black: `#111111` (text, icons, outlines, dark UI elements)
- 10% Gold: `#D4AF37` (accents, CTAs, active states, highlights, brand identity)
- Supporting golds for gradients/glows: `#C5A028` (darker), `#E8C547` (lighter)
- Glass surfaces: `rgba(255,255,255,0.70)` to `rgba(255,255,255,0.90)` with `backdrop-blur(12px)` and subtle gold `inset box-shadow`
- Error: `#DC2626` | Warning: `#F59E0B` | Success: `#16A34A` | Info: `#2563EB`

**Typography:**
- Display/Headings: Playfair Display (serif) — elegance, tradition, Kingdom gravitas
- Body/UI: Inter (sans-serif) — clean, modern, highly legible at all sizes
- Gold text `#D4AF37` used for: brand wordmark, active nav labels, key CTA text
- ALL CAPS sparingly: category badges, nav labels, status pills

**Corner radii:** `rounded-2xl` (16px) for cards/panels, `rounded-full` for pills/badges/avatars, `rounded-xl` (12px) for buttons

**Shadows & depth:** Layered glass: `shadow-lg` + gold-tinted inset ring (`ring-1 ring-inset ring-[#D4AF37]/10`). Panels stack with increasing z-index and subtle scale difference.

**Icons:** Lucide icon set — thin, consistent stroke weight. Gold fill for active/selected states, `#111` stroke for default.

**Motion principles:** Smooth slide-in panels (right-to-left for content, left-to-right for filters). Fade-up for cards. Pulse animation for live/active map markers. All transitions 200-300ms ease-out.

---

### GLOBAL LAYOUT STRUCTURE

The app is full-screen, map-first. No traditional page-scroll layout — the map IS the background. All UI floats above it.

```
+-----------------------------------------------------------+
|  [Navbar - sticky top, glass, z-50]                       |
|  Logo | Search? | Consider | Messages | Notifications | Me|
+-----------------------------------------------------------+
|                                                           |
| [Burger    [=== FULL-SCREEN MAP (MapLibre) ===]  [Right  |
|  Menu]                                             Panel] |
| (left      Map markers: events (gold circles),            |
|  drawer)   places (gold rounded squares)          (slides |
|                                                    in for |
| [Filters]  [Bottom stats bar]            [Layers]  detail |
|                                                    views) |
+-----------------------------------------------------------+
```

**Key patterns:**
1. **Right-side panel** — ALL content detail views (events, places, organisations, search results, messages) slide in from the right as glass overlay panels. Panels stack (opening org from event stacks a second panel). Back arrow returns to previous.
2. **Left burger drawer** — Filters, Considerations, past events toggle, profile quick-link, sign out. NOT admin links.
3. **Glass overlay** — Full-screen frosted backdrop for calendar, modals, consent gates.
4. **Floating controls** — Filter button (left), Layers button (right), bottom stats bar — all float above the map.

---

### PAGES & SCREENS TO DESIGN

Design each of the following as a distinct Figma frame. Include both desktop (1440px) and mobile (390px) variants.

---

#### 1. MAP HOME (Primary view — `/`)

The default and most important screen. Citizens land here.

**Elements:**
- Full-screen map canvas (light/cream style, NOT dark)
- **Navbar** (top): Glass bar (`bg-white/90 backdrop-blur-md`), height 56px
  - Left: "CITIZENS" wordmark in gold Playfair Display + small crown icon
  - Right: ConsiderBadge (gold heart icon + count), Messages icon (with unread badge), NotificationBell (gold bell + count), Profile avatar dropdown
- **Search bar** floating below navbar, centered, glass pill: "Search events, places, or organisations..."
- **Map markers:**
  - Events: Gold `#D4AF37` circle with white category icon inside, 2px `#111` outline. Today/live events have a pulsing gold ring animation.
  - Places: `#111` rounded square with gold category icon inside, 2px `#111` outline.
  - Temporal opacity: today=100%, 7d=80%, 14d=60%, 31d+=40%
- **Quick-action popup** (on marker tap): Small glass card above marker — event name, date, category pill, two buttons: "Connect" (RSVP, gold) and "Consider" (outline gold). Tap "View" area opens right panel.
- **Floating controls:**
  - Left: "Filters" button (filter icon + label) — opens left drawer
  - Right: "Layers" button (layers icon + label) — toggles map visualisation layers
- **Bottom stats bar** (glass, docked bottom-center): "X Events" | "X Places" | "X Organisations" with small icons
- **Calendar toggle button** (top-right area or near search): Opens the glass overlay calendar

**States:** Empty map (no results), loading skeleton, marker clusters at zoom-out

---

#### 2. EVENT DETAIL PANEL (Right-side slide-in — `@panel/(.)events/[id]`)

Slides in from right over the map. Width ~420px desktop, full-width mobile.

**Elements:**
- Glass panel: `bg-white/90 backdrop-blur-md`, rounded-l-2xl, shadow-2xl
- Top: Back arrow (left), Share button, Report button (right)
- **Hero image** (if uploaded) — full-width, rounded top, with gradient overlay
- **Event name** — Playfair Display, large
- **Category badge** — Gold pill with icon (e.g., "Worship", "Outreach", "Market")
- **Date/time row** — Calendar icon + formatted date + clock icon + time
- **Location row** — Pin icon + venue name + "View on map" link
- **Organiser card** — Small glass card: org logo, name (links to org panel), message button (icon)
- **Description** — Body text, Inter
- **Tags** — Horizontal chip list (gold outline pills)
- **RSVP section:**
  - "Connect" button (primary gold, full-width) — changes to "Connected" (green check) after RSVP
  - "Consider" button (outline gold) — changes to "Considering" with gold fill
  - Attendee count: "X people going" with small avatar stack
- **Who is attending** section — Avatar chips of discoverable attendees (fellow RSVPers only)
- **Volunteer apply button** (if volunteer_openings=true) — Gold outline button "Volunteer for this event"
- **Location sharing toggle** — Small switch to share live location with other attendees
- **Updates section** — "From the Organiser" header, chronological broadcast messages with timestamps
- **Comments section** — Threaded comments with reply, like
- **Media gallery** — Horizontal scrollable image strip

---

#### 3. PLACE DETAIL PANEL (Right-side — `@panel/(.)places/[id]`)

Similar structure to event detail but for permanent locations (churches, community centres, businesses).

**Elements:**
- Glass panel, same dimensions as event detail
- Cover image / media strip
- Place name (Playfair Display)
- Category badge + verified badge (gold check if verified)
- Address row with map pin + "Get directions" link
- Owner/organisation card (logo + name + message button)
- Description
- Operating hours (if applicable)
- "Follow this place" button (gold outline, toggles to "Following")
- Volunteer apply button (if applicable)
- Reviews section (star rating + review cards)
- Associated events list (upcoming events at this place)

---

#### 4. CONTRIBUTOR/ORGANISATION PROFILE PANEL (Right-side — `@panel/(.)c/[slug]`)

The public-facing organisation profile.

**Elements:**
- Cover image (full-width banner, with gradient overlay)
- Organisation logo (circular, overlapping cover at bottom-center)
- Organisation name (Playfair Display) + category badge
- Faith statement / bio (short)
- Stats row: Followers | Events hosted | Places
- **Follow button** (gold, toggles)
- **Message button** (icon beside follow)
- Location(s) — primary + additional, each with pin icon
- Website + social links (Instagram, Facebook, TikTok icons)
- **Activity (30d)** — Glass pill chips showing recent follower/join counts
- **Team section** — Avatar + name chips of active team members, owner has gold "OWNER" tag
- **Upcoming Events** — Scrollable horizontal card list (EventCard components)
- **Past Events** — Simple chronological list (name + date + category badge)
- **Gallery** — Media strip (horizontal scroll of images)
- **Broadcast Updates** — Reverse-chronological list of org broadcast messages

---

#### 5. BURGER MENU / LEFT DRAWER

Slides in from the left. Glass panel.

**Sections (top to bottom):**
1. **User profile quick card** — Avatar, name, "View profile" link
2. **Map Filters:**
   - Categories — Checkboxes with icons (Church, Outreach, Market, Worship, Education, Sport, Youth, etc.)
   - Date range — Quick pills: Today, This week, This weekend, This month, Custom
   - Distance — Slider or preset pills: 5km, 10km, 25km, 50km
3. **Considerations** (accordion, two sub-tabs):
   - *My Considerations* — List of events I've tapped Consider on. Each: name, date, category, "Remove" option
   - *Friends* — Events mutual friends are considering. Each: name, date, friend avatars, "Convince" button (gold)
4. **Quick Access** — Customisable shortcut buttons (Where to Serve, Weekend Events, Near Me, etc.)
5. **Past events toggle** — Switch to show/hide past events on map
6. **Sign out** link

---

#### 6. GLASS OVERLAY CALENDAR

Full-screen frosted overlay triggered by calendar button. `backdrop-filter: blur(12px)`, `bg-black/60`.

**Elements:**
- Month title + left/right arrow navigation
- 7-column CSS grid for day tiles
- **Gold-highlighted tiles** for days with RSVPed events
- **Semi-opaque gold tiles** for days with non-joined events
- **Empty tiles** — subtle border
- Tap a day tile with events → shows small event list below calendar → tap event → opens event detail panel
- Close button (X) top-right, Escape key closes

---

#### 7. MESSAGING PANEL (Floating — anchored top-right)

Floating glass panel, 360px wide, max 50vh tall.

**Elements:**
- Glass card: `bg-white/90 backdrop-blur-sm` + gold inset shadow
- **Conversation list:**
  - Each row: Avatar, name, last message preview, timestamp, unread badge (gold)
  - Pending requests sorted first (amber border)
  - Hover reveals action icons (mute, delete, report, block)
- **Inline chat view** (on row tap):
  - Back arrow to return to list
  - Message bubbles: sent (gold-tinted bg, right-aligned), received (white bg, left-aligned)
  - Input bar at bottom: text field + send button (gold)
- **Message request card** (for pending conversations):
  - "Allow" button (gold) and "Deny" button (outline) 
  - Sender info + context text

---

#### 8. NOTIFICATION PANEL (Floating — anchored near bell icon)

**Elements:**
- Glass dropdown panel
- Notification rows: icon (type-dependent), text, timestamp, unread indicator (gold dot)
- Types: team_invite, broadcast, dm_received, event_update, follow, volunteer_application, etc.
- "Mark all read" link at top
- Deep-link: tapping notification navigates to relevant panel/page

---

#### 9. AUTHENTICATION PAGES

Full-screen, NOT map-based. Clean, centred card layout.

**a. Login (`/login`):**
- Centred glass card on off-white background
- "CITIZENS" wordmark + crown logo at top (gold)
- "Welcome back" heading (Playfair Display)
- Email input + password input (Inter, clean borders)
- "Sign in" button (gold, full-width)
- OAuth buttons: Google, Apple (standard icons)
- "Forgot password?" link
- "Don't have an account? Sign up" link

**b. Signup (`/signup`):**
- Same centred glass card style
- "Join the Kingdom" heading
- Full name, email, password, confirm password fields
- Province selector dropdown (South African provinces)
- Terms acceptance checkbox: "I agree to the Terms of Service"
- "Create account" button (gold)
- OAuth buttons
- "Already have an account? Sign in" link

**c. Forgot Password (`/login/forgot-password`):**
- Minimal card: email input + "Send reset link" button

**d. Reset Password (`/login/reset-password`):**
- New password + confirm password + "Reset password" button

---

#### 10. CITIZEN PROFILE PAGE (`/profile/[id]`)

**Elements:**
- Avatar (large, centred) + cover image banner
- Full name + @handle (if discoverable)
- Bio / interests
- "Edit profile" button (own profile only)
- Province / location
- **Joined events** section — list of upcoming RSVPed events
- **Following** section — list of followed organisations
- **Social links** (if set)
- Privacy controls section (own profile): discoverable toggle, notification preferences

---

#### 11. CONTRIBUTOR DASHBOARD (`/c/[slug]/dashboard`)

Private dashboard for contributors to manage their organisation. Accessed via profile menu. Uses a sidebar nav (NOT the burger menu).

**Dashboard sidebar nav:**
- Overview (home icon)
- Events (calendar icon)
- Places (map-pin icon)
- Broadcasts (megaphone icon)
- Team (users icon)
- Inbox / Suggestions (inbox icon)
- Analytics (chart icon)
- Planning (clipboard icon)
- Settings (gear icon)

**a. Overview (`/c/[slug]/dashboard`):**
- Welcome banner with org name
- Stat cards row: Total events, Total places, Followers, Page views (30d)
- Recent activity feed
- Quick action buttons: Create Event, Create Place, Post Broadcast

**b. Events (`/c/[slug]/dashboard/events`):**
- List of all contributor's events (upcoming + past tabs)
- Each row: event name, date, attendee count, status badge
- "Create Event" button (gold)

**c. Places (`/c/[slug]/dashboard/places`):**
- Grid/list of contributor's places
- Each: name, category, verified status, follower count
- "Add Place" button

**d. Broadcasts (`/c/[slug]/dashboard/broadcasts`):**
- Composer: textarea (max 1000 chars) + "Post Update" button (gold)
- List of sent broadcasts with timestamps

**e. Team (`/c/[slug]/dashboard/team`):**
- Active members list: avatar, name, role badge (Owner/Editor/Viewer), remove button
- Pending invites section
- "+ Add team member" button → popup with 3 search fields (name, email, user ID)
- Owner transfer section (visible to owner only)

**f. Inbox (`/c/[slug]/dashboard/inbox`):**
- Community suggestions received
- Each: title, description, page URL, timestamp, status pill (Open/In Review/Actioned/Declined)

**g. Analytics (`/c/[slug]/dashboard/analytics`):**
- Period selector (7d, 14d, 30d, 60d, 90d)
- Metric cards: Views, RSVPs, Follows, Considers, Comments
- Entity filter: All / per-event / per-place
- Export buttons: CSV, XLSX

**h. Planning (`/c/[slug]/dashboard/planning`):**
- Two tabs: Tasks | Ideas
- Expandable card grid
- Each card: title, status/tag chips, expand to show checklist, links, assigned places, description
- Tasks: completion checkbox (circle), due date
- Ideas: tag editor, delete

**i. Settings (`/c/[slug]/dashboard/settings`):**
- Public handle section (with /c/ prefix, 30-day cooldown notice)
- Organisation name, description, logo upload
- Category selector
- Social links (website, Instagram, Facebook, TikTok)
- Specialised services chip editor
- Keywords chip editor
- Danger zone: delete organisation

---

#### 12. ADMIN DASHBOARD (`/admin`)

Separate from the contributor dashboard. Clean, functional, minimal chrome.

**Admin sidebar nav:**
- Dashboard (home)
- Applications (contributor applications)
- Contributors (all contributors)
- Users (all users)
- Categories
- Tags
- Reported content
- Suggestions
- API Keys

**a. Dashboard (`/admin`):**
- Stat cards: Pending applications, Reported content, Total users, Total events, Total places, Open suggestions
- Tools grid with icon tiles linking to each admin page

**b. Applications (`/admin/applications`):**
- List of pending contributor applications
- Each: org name, type, applicant name, date, description
- Approve / Reject buttons (Reject shows reason textarea)

**c. Suggestions (`/admin/suggestions`):**
- Tab nav: Open | In Review | Actioned | Declined
- List with status pills, inline response area
- Export buttons (CSV/XLSX)

---

#### 13. EVENT CREATION/EDIT FORM (`/events/new`, `/events/[id]/edit`)

Full-page form (not a panel).

**Elements:**
- Step-by-step or single-scroll form
- Fields: Title, description (rich text), category (dropdown), tags (multi-select chips), date/time picker, end date/time, location picker (map + search), venue name, cover image upload, media gallery upload, volunteer openings toggle, indemnity requirement toggle
- "Publish Event" button (gold, prominent)
- Preview card showing how the event will appear

---

#### 14. PLACE CREATION/EDIT FORM (`/places/new`, `/places/[id]/edit`)

Similar structure to event form.

**Fields:** Name, description, category, address/location (map picker), operating hours, cover image, media gallery, volunteer openings toggle

---

#### 15. LANDING PAGE (`/` when not logged in)

If user is NOT authenticated, show a landing page instead of the map.

**Elements:**
- Hero section: Large "CITIZENS" wordmark, "Connecting the Kingdom" subtitle, brief value prop, "Get Started" CTA (gold), "Sign In" secondary link
- Map preview / screenshot showing markers
- Feature highlights: "Discover Events", "Find Community", "Connect with Purpose" — 3 cards with icons
- Testimonial / scripture quote section
- Footer: Links, social icons, legal

---

#### 16. QUICK ACTION POPUP (Map marker tap)

Small floating glass card that appears above a tapped marker.

**Elements:**
- Event/place name (bold)
- Date (for events) or category (for places)
- Two-button row: "Connect" (gold fill) + "Consider" (gold outline) for events, or "Visit" (gold fill) for places
- Tap anywhere else on the popup → opens detail panel
- Small triangle/arrow pointing down to the marker

---

#### 17. SUGGESTION BUTTON & COMPOSER

Floating button (bottom-right corner of every page).

**Button:** Small glass circle with lightbulb/sparkle icon

**Composer (on tap):** Glass panel overlay:
- "Share a Suggestion" heading
- Title input (required, min 3 chars)
- Description textarea (required, min 10 chars)
- "Submitted from: /current-page" context line (italic, small)
- "Submit" button (gold)

---

#### 18. VOLUNTEER APPLY FLOW

Inline in event/place detail panels.

**States:**
- Default: "Volunteer" CTA button (gold outline)
- Form: Optional message textarea (500 char limit with counter), "Apply" button
- Pending: Amber "Pending" badge
- Approved: Green "Approved" badge
- Declined: Grey "Not selected" badge
- Withdraw: "Withdraw application" link (destructive, confirm)

---

### COMPONENT LIBRARY

Design these as reusable Figma components:

1. **Glass Card** — Base card with frosted glass effect, multiple sizes (sm, md, lg)
2. **Gold Button** — Primary CTA, `bg-[#D4AF37] text-white`, hover darkens
3. **Outline Button** — Gold border, transparent bg, gold text
4. **Category Badge** — Rounded-full pill with icon + label, multiple colour variants
5. **Status Badge** — Pending (amber), Active (green), Declined (grey), Completed (blue)
6. **Avatar** — Circular, sizes: xs (24px), sm (32px), md (40px), lg (64px), xl (96px)
7. **Avatar Stack** — Overlapping avatar row with "+N more" pill
8. **Stat Card** — Glass card with icon, label, large number
9. **Input Field** — Clean border, Inter font, focus state with gold ring
10. **Dropdown/Select** — Glass-styled dropdown panel
11. **Toggle/Switch** — Gold accent when active
12. **Notification Row** — Icon + text + timestamp + unread dot
13. **Event Card** — Compact card for event lists (image, title, date, category, attendee count)
14. **Place Card** — Similar to event card but with address and follow count
15. **Organisation Chip** — Small: logo + name (used in event detail organiser field)
16. **Tag Chip** — Small rounded pill (gold outline or filled)
17. **Progress Bar** — Gold fill on grey track
18. **Map Marker** — Event circle + Place rounded square SVG icons
19. **Toast/Alert** — Glass notification toast (success/error/info variants)
20. **Confirm Modal** — Glass overlay modal with title, message, Cancel + Confirm buttons
21. **Empty State** — Centred illustration/icon + message + CTA
22. **Skeleton Loader** — Animated shimmer placeholders matching card/panel shapes
23. **Breadcrumb/Back Navigation** — "< Back" arrow for panel navigation

---

### RESPONSIVE BREAKPOINTS

- **Mobile (< 640px):** Full-width panels, bottom nav bar replaces top nav items, stacked layouts, burger menu becomes primary nav
- **Tablet (640-1024px):** Narrower right panels (~50% width), sidebar collapses
- **Desktop (1024px+):** Full layout as described, right panels ~420px, sidebar always visible in dashboard

---

### BRAND ELEMENTS TO INCLUDE

- Crown icon/logo (regal, geometric, minimal — placeholder if final logo not ready)
- "CITIZENS" wordmark in Playfair Display, gold
- "Connecting the Kingdom" tagline in Inter, `#111`
- Ephesians 2:19 quote styled as a decorative element for landing/auth pages

---

### DESIGN TOKENS SUMMARY

```
--color-gold: #D4AF37
--color-gold-dark: #C5A028
--color-gold-light: #E8C547
--color-black: #111111
--color-white: #FAFAF7
--color-glass-bg: rgba(255,255,255,0.85)
--color-glass-border: rgba(212,175,55,0.10)
--blur-glass: 12px
--radius-card: 16px
--radius-button: 12px
--radius-pill: 9999px
--shadow-panel: 0 25px 50px -12px rgba(0,0,0,0.15)
--font-display: 'Playfair Display', serif
--font-body: 'Inter', sans-serif
--transition-panel: 300ms ease-out
--transition-button: 200ms ease-out
```
