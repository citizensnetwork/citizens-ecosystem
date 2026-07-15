-- ============================================================================
-- teardown-feed.sql — remove the Citizens Wear launch feed seed
-- ----------------------------------------------------------------------------
-- Deletes the 7 seed identities. Every seeded row (brands, posts, post_media,
-- stories, follows, likes, comments, concept + media/upvotes/proposals/claim/
-- status_log/royalty, brand_verifications, the auto Completed-Concept post) is
-- removed by ON DELETE CASCADE from wear.users -> auth.users. Follows FROM the
-- founder accounts TO seed users also cascade (target side). The founder's own
-- accounts, admin role, and any real user data are untouched.
--
-- Safe to run repeatedly (deletes nothing if the seed is already gone).
-- ============================================================================
delete from auth.users where id in (
  '5eed0001-0000-4000-a000-000000000001',  -- Cornerstone Apparel owner
  '5eed0002-0000-4000-a000-000000000002',  -- Lily & Field owner
  '5eed0003-0000-4000-a000-000000000003',  -- Salt & Light Threads owner
  '5eed0004-0000-4000-a000-000000000004',  -- Ubuntu Kingdom Co. owner
  '5eed0005-0000-4000-a000-000000000005',  -- Anchor & Crown owner
  '5eed0011-0000-4000-a000-000000000011',  -- Grace Lethabo (concept creator)
  '5eed0012-0000-4000-a000-000000000012'   -- Thabo M.
);
