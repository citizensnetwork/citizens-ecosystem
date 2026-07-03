-- ============================================
-- Migration 006: Fix RSVP visibility + schema sync
-- ============================================

-- RSVPs are not sensitive — allow public counting/viewing.
-- Without this, RSVP counts return 0 for non-owners.
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'RSVPs are viewable by everyone' and tablename = 'rsvps') then
    create policy "RSVPs are viewable by everyone" on public.rsvps
      for select using (true);
  end if;
end $$;
