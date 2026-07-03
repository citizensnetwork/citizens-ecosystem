-- 053_destructive_reseed_wipe.sql
-- ───────────────────────────────────────────────────────────────────────────
-- DESTRUCTIVE: wipes all event-, place-, and conversation-related data so
-- the upcoming seed (054) can re-populate the platform with curated content.
--
-- PRESERVED:
--   • auth.users + public.profiles               (real users)
--   • categories                                 (just consolidated in 052)
--   • interest_groups + interests                (taxonomy)
--   • user_interests + user_locations            (user personalisation)
--   • contributor_applications + reports         (audit trail)
--   • app_settings + api_keys + admin_actions    (system state)
--   • analytics_daily + ai_search_queries        (history)
--
-- WIPED:
--   events, rsvps, comments, reviews, event_photos, event_views,
--   event_interest_tags, places, place_follows, follows, conversations,
--   conversation_participants, messages, notifications, push_tokens,
--   directory_contributors (cache), featured_listings.
--
-- Idempotent: TRUNCATE is safe to re-run.
-- Order observed below respects FK chains (children before parents).
-- ───────────────────────────────────────────────────────────────────────────

begin;

-- Children of events
truncate table public.event_views          restart identity cascade;
truncate table public.event_photos         restart identity cascade;
truncate table public.event_interest_tags  restart identity cascade;
truncate table public.rsvps                restart identity cascade;
truncate table public.comments             restart identity cascade;

-- Reviews touch events AND places — wipe before either parent
truncate table public.reviews              restart identity cascade;

-- Notifications and push tokens
truncate table public.notifications        restart identity cascade;
truncate table public.push_tokens          restart identity cascade;

-- Messaging
truncate table public.messages                  restart identity cascade;
truncate table public.conversation_participants restart identity cascade;
truncate table public.conversations             restart identity cascade;

-- Social graph + place follows
truncate table public.follows              restart identity cascade;
truncate table public.place_follows        restart identity cascade;

-- Featured listings (directory_contributors is a view — refreshes from profiles+events)
truncate table public.featured_listings    restart identity cascade;

-- Now safe to wipe the parents
truncate table public.events restart identity cascade;
truncate table public.places restart identity cascade;

commit;
