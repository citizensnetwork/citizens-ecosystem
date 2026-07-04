# Future Ideas — Citizens Connect & Ecosystem

> Running list of deferred features and ideas. Capture here, decide in planning.
> **Do not build from this list without first evaluating against MASTER_DIRECTION.md and the current batch queue.**
> Last updated: May 2026

---

## Citizens Connect — Deferred Features

### AI & Intelligence
- **AI-powered search / recommendations** — Natural-language event search ("find me something for youth in Centurion next weekend"). Semantic matching on interests, location, and past activity. Powered by Supabase pgvector or OpenAI embeddings.
- **AI content moderation** — Auto-flag events/posts that may violate guidelines before admin review. Reduces admin workload as platform scales.
- **AI event categorisation suggestion** — Suggest category + tags from event title/description on creation. (`lib/categorySuggest.ts` partially exists.)

### Localisation
- **Multilingual support — Afrikaans first** — UI and event content in Afrikaans. Align with SA Christian demographic reality. Must not compromise English-first performance.
- Future: isiZulu, Sesotho, Setswana for broader SA reach.

### Safety & Emergency
- **CASI SOS integration** — One-tap armed response (CASI: casi-app.com, Pretoria, R35/month). Deferred: locked decision D12. Implementation: mobile-only Capacitor deep-link to CASI app or in-app panic button with geolocation share.

### Analytics & Metrics
- **Citizens Vision analytics dashboard** — Contributor-facing dashboard showing event reach: views, RSVPs, considers, shares, audience demographics (aggregate/private). Helps contributors measure Kingdom impact.
- **Heatmap of Kingdom activity** — Admin/internal view showing event density by region and time. Useful for outreach planning.

### Social & Community
- **Citizens Social** — A lightweight social feed layer within Connect (or a future channel). Status updates, testimonies, prayer requests. Distinct from events — it's the "daily life of the Kingdom" layer.
- **Friend activity in burger bar** — Show what friends are attending/considering. Drives social discovery within existing Connect structure. Part of FEAT-04 (Consider → Convince).
- **Group / home group profiles** — Sub-type of Contributor for informal groups (home groups, prayer circles) that don't need full organisational profiles.

### Map & Discovery
- **Mapbox migration consideration** — MapTiler + MapLibre is the current locked choice (D4). Future note: if custom styling becomes limiting, revisit Mapbox. Not a current priority.
- **Route planning** — "Get directions" deep-link to Google Maps / Apple Maps from event/place detail panel.
- **Radius-based notifications** — Notify Citizens when a new event appears within their saved radius. Requires background geolocation (Capacitor Background Geolocation plugin).

### Payments & Billing
- **PayFast integration** — Contributor billing: free tier + paid tiers per events posted per month. Locked decision D11. Deferred until contributor base justifies monetisation.
- **Ticketed events** — Optional ticket sales through PayFast for large events (conferences, concerts). Long-term.

---

## Ecosystem Channels — Future

### Citizens Wear
Social-media-style marketplace for Christian clothing and merchandise. Brands post products; Citizens browse and buy. Shared Supabase project. Design: same gold/black/white system.

### Citizens Learn
Faith-based learning platform — courses, discipleship content, educational resources. Ministries publish; Citizens enrol. Integrates with Citizens Connect Contributor profiles for cross-promotion.

### Citizens Central
Comprehensive directory of all Christian entities in SA (and beyond). Searchable, filterable. Collaborative event planning between organisations. More structured than Connect — the "Yellow Pages of the Kingdom."

### Citizens Impact
Structured social impact platform for businesses, institutions, and large organisations. Project creation, volunteer coordination, funding, community partnerships.

---

## Architecture / Infrastructure Ideas

- **Monorepo structure** — As Wear and Learn are built, consider migrating to a Turborepo monorepo with shared `packages/` (types, ui components, supabase client). Planned in Batch 6.
- **Edge caching for map data** — Cache event markers at Supabase Edge or Vercel Edge for faster map load at scale.
- **Offline-first map tiles** — Capacitor: cache map tiles for areas a user visits frequently. Useful for mobile data-light environments in SA.
