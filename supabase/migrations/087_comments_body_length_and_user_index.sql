-- ============================================================================
-- 087_comments_body_length_and_user_index.sql
--
-- Adds a server-enforced length cap on comment bodies and a user_id index for
-- ownership / moderation lookups. The previous shipped state relied solely on
-- the client's `maxLength={1000}` which is bypassable via direct supabase-js
-- calls. 2000 chars matches the messaging table convention and gives headroom
-- for any pre-existing rows above the client cap.
-- ============================================================================

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comments_body_length_chk'
      and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
      add constraint comments_body_length_chk
      check (char_length(body) between 1 and 2000) not valid;
    alter table public.comments validate constraint comments_body_length_chk;
  end if;
end $$;

create index if not exists comments_user_id_idx on public.comments(user_id);
