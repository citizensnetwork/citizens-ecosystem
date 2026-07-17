-- ============================================================================
-- 163_wear_impersonation_phase1.sql — Admin sign-in-as, Phase 1 (READ-ONLY)
-- (docs/Citizens_Wear_Roles_and_Concepts_MD.md §7, DESIGN RATIFIED 2026-07-16;
--  §7.6 open questions RATIFIED 2026-07-17: per-view SECDEF readers ·
--  one-active-per-admin AND per-target · spec notification copy, no link)
-- ============================================================================
-- Phase 1 lets an admin view any user's account exactly as that user sees it,
-- fully audited, with ZERO write-as-user capability. The admin keeps their own
-- token/identity; RLS still governs everything they do as themselves. The
-- target's view is served exclusively through the is_admin()-gated SECURITY
-- DEFINER reader functions below (§7.1 — an X-Impersonate header cannot work:
-- it doesn't change auth.uid(); Phase 2 token-minting is a SEPARATE ratified
-- design, deliberately NOT built here).
--
--   * impersonation_sessions — append-only audit spine. reason REQUIRED at
--     start; 30-minute time-box (expires_at); ended_at NULL while active.
--     TWO partial unique indexes = at most one ACTIVE session per admin AND
--     per target (ratified "both"; a second admin gets a fail-closed
--     'target_under_review'). Immutable: no client write path at all (writes
--     happen only inside the SECDEF fns), a BEFORE UPDATE guard freezes every
--     column except the one-shot close stamp, and closed rows are frozen
--     entirely. Grants are SELECT-only to authenticated; RLS SELECT is
--     wear.is_admin() (the bench may review the trail; targets get the
--     after-session notification instead — ratified "no link yet").
--
--   * impersonation_actions — child log: EVERY privileged read taken during a
--     session (view_profile / view_feed / view_saves / view_notifications /
--     view_conversations / view_dm_thread), detail jsonb, and the DM-access
--     reason (§7.2-3: each DM THREAD open carries its own required reason).
--     The audit row is inserted INSIDE the same reader fn that returns the
--     data — an unaudited privileged read is structurally impossible, not
--     merely discouraged. Append-only (BEFORE UPDATE always raises; no
--     authenticated write grants; DELETE only via the FK cascade so account
--     deletion keeps working — §3R lesson).
--
--   * Readers return ONLY what the TARGET could see: their profile+settings
--     VIEW, their feed composition (follows ∪ self — mirrors the app's two
--     feed modes exactly, including the no-block-filter semantics), their
--     private saves, their notifications, their conversation LIST as
--     metadata only (member handles + timestamps, NO message bodies — the
--     per-thread reason gate is what unlocks bodies), and a DM thread WITH
--     reason. No credentials exist anywhere in wear.* to expose; settings are
--     view-only (no mutation path is added in Phase 1, anywhere).
--
--   * Expiry model (fail closed): a raise after an UPDATE would roll the
--     close back, so the validator NEVER closes — it just refuses
--     ('session_expired') once expires_at passes. Closing happens where it
--     commits: impersonation_end (works on an expired session, records cause
--     'expired'), impersonation_start's self-healing pre-sweep (unblocks the
--     partial unique indexes), and the pg_cron sweep every 5 minutes for
--     abandoned sessions — which is what GUARANTEES the after-session
--     notification (§7.2-4) even if the admin closes the tab and never
--     returns.
--
--   * NOTIFICATION (ratified copy, composed client-side like every mig-159
--     type): "An administrator accessed your account for support on <date>."
--     Emitted by an AFTER UPDATE trigger when ended_at flips non-null —
--     trigger-produced ONLY (mig-159 invariant). actor_id NULL: the notice is
--     institutional (Citizens Wear), the admin's identity lives in the audit
--     table for the bench, not in the target's inbox (mig-162 precedent).
--     data carries {sessionId, startedAt, endedAt, date} so a future
--     audit-summary surface can deep-link retroactively (ratified 7.6c).
--
--   * SELF-impersonation is blocked (CHECK + fn guard): a read-only self-view
--     adds no capability and would only muddy the audit trail. NOT a §7.2
--     re-decision — §7.2-2 ("any tier") is about Citizen…Admin, all of which
--     remain valid targets. ⚠ Admin-impersonating-ADMIN stays allowed and
--     harmless here (read-only) but is the flagged privilege-escalation
--     vector Phase 2 MUST lock down before any write-as-user ships.
--
-- Conventions: mig-143/157/162 style (RLS every table, SECDEF hardened with
-- empty search_path + revoke-from-public, schema-qualified bodies, explicit
-- least-privilege grants — mig-146 lesson), every FK indexed, enum literals
-- only inside plpgsql bodies so ALTER TYPE ADD VALUE is transaction-safe
-- (mig-161/162 note), cron registration per mig-141.
-- ============================================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────
create type wear.impersonation_action as enum (
  'view_profile',
  'view_feed',
  'view_saves',
  'view_notifications',
  'view_conversations',
  'view_dm_thread'
);

create type wear.impersonation_end_cause as enum ('admin_exit', 'expired');

alter type wear.notification_type add value 'account_accessed_by_admin';

-- ── 2. The audit spine ──────────────────────────────────────────────────────
create table wear.impersonation_sessions (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid not null references wear.users(id) on delete cascade,
  target_user_id uuid not null references wear.users(id) on delete cascade,
  -- Why this account is being viewed — required BEFORE the session exists.
  reason         text not null check (length(btrim(reason)) between 5 and 500),
  started_at     timestamptz not null default now(),
  -- The §7.4 time-box: fixed 30 minutes, stamped by the start fn (the column
  -- default matches so a service seed behaves identically).
  expires_at     timestamptz not null default (now() + interval '30 minutes'),
  ended_at       timestamptz,
  end_cause      wear.impersonation_end_cause,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint impersonation_sessions_not_self  check (admin_id <> target_user_id),
  constraint impersonation_sessions_box       check (expires_at > started_at),
  constraint impersonation_sessions_close     check ((ended_at is null) = (end_cause is null)),
  constraint impersonation_sessions_close_seq check (ended_at is null or ended_at >= started_at)
);

-- Ratified 7.6b "both": at most one ACTIVE session per admin AND per target.
create unique index impersonation_one_active_per_admin
  on wear.impersonation_sessions(admin_id) where ended_at is null;
create unique index impersonation_one_active_per_target
  on wear.impersonation_sessions(target_user_id) where ended_at is null;
-- Full FK indexes (advisor gate) + the audit-review read patterns.
create index impersonation_sessions_admin_idx
  on wear.impersonation_sessions(admin_id, started_at desc);
create index impersonation_sessions_target_idx
  on wear.impersonation_sessions(target_user_id, started_at desc);
-- The cron sweep's scan: open sessions only.
create index impersonation_sessions_open_idx
  on wear.impersonation_sessions(expires_at) where ended_at is null;

alter table wear.impersonation_sessions enable row level security;

create trigger trg_impersonation_sessions_updated_at
  before update on wear.impersonation_sessions
  for each row execute function wear.set_updated_at();

-- ── 3. The per-read audit log ───────────────────────────────────────────────
create table wear.impersonation_actions (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references wear.impersonation_sessions(id) on delete cascade,
  at         timestamptz not null default now(),
  action     wear.impersonation_action not null,
  detail     jsonb not null default '{}'::jsonb
             check (jsonb_typeof(detail) = 'object' and length(detail::text) <= 2000),
  -- §7.2-3: a DM thread open carries its own reason — exactly then, never else.
  dm_reason  text check (dm_reason is null or length(btrim(dm_reason)) between 5 and 500),
  constraint impersonation_actions_dm_reason
    check ((action = 'view_dm_thread') = (dm_reason is not null))
);

create index impersonation_actions_session_idx
  on wear.impersonation_actions(session_id, at);

alter table wear.impersonation_actions enable row level security;

-- ── 4. Immutability guards (append-only means append-only) ──────────────────
-- Sessions: while open, ONLY the close stamp (+updated_at) may change — the
-- start facts (who/whom/why/when/box) are frozen at INSERT. Once closed the
-- row is frozen entirely. Plain trigger fn (runs as invoker under the table
-- owner's UPDATE, same as set_updated_at); fires for service_role too.
create or replace function wear.protect_impersonation_session()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.ended_at is not null then
    raise exception 'impersonation sessions are immutable once closed';
  end if;
  if new.id             is distinct from old.id
     or new.admin_id       is distinct from old.admin_id
     or new.target_user_id is distinct from old.target_user_id
     or new.reason         is distinct from old.reason
     or new.started_at     is distinct from old.started_at
     or new.expires_at     is distinct from old.expires_at
     or new.created_at     is distinct from old.created_at then
    raise exception 'only the close stamp of an impersonation session is writable';
  end if;
  return new;
end $$;
revoke all on function wear.protect_impersonation_session() from public;
create trigger trg_protect_impersonation_session
  before update on wear.impersonation_sessions
  for each row execute function wear.protect_impersonation_session();

-- Actions: never updatable, by anyone, ever. (No DELETE guard: the FK cascade
-- from an account deletion must keep working — §3R lesson; no client role
-- holds DELETE anyway.)
create or replace function wear.protect_impersonation_action()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'impersonation audit actions are append-only';
end $$;
revoke all on function wear.protect_impersonation_action() from public;
create trigger trg_protect_impersonation_action
  before update on wear.impersonation_actions
  for each row execute function wear.protect_impersonation_action();

-- ── 5. RLS + grants (read-only surface; writes live in the SECDEF fns) ──────
-- The moderation BENCH is deliberately excluded: impersonation is admin-only
-- in every respect (§7.2-5), including reviewing who used it.
create policy impersonation_sessions_admin_read on wear.impersonation_sessions
  for select using (wear.is_admin());
create policy impersonation_actions_admin_read on wear.impersonation_actions
  for select using (wear.is_admin());
-- NO insert/update/delete policies and NO client write grants: the SECDEF fns
-- (owner) and service_role are the only writers — a policy bug can never open
-- a client write path because the grant layer already forbids it (mig-146).
grant select on wear.impersonation_sessions to authenticated;
grant select on wear.impersonation_actions  to authenticated;
grant all on wear.impersonation_sessions to service_role;
grant all on wear.impersonation_actions  to service_role;

-- ── 6. Internal helpers (no EXECUTE grants → callable only via the fns) ─────
-- Session row → the camelCase jsonb the API serves (single mapping point).
-- (stable, not immutable: jsonb timestamptz rendering follows the session
-- TimeZone GUC, so this is not a pure function of its argument.)
create or replace function wear.impersonation_session_jsonb(s wear.impersonation_sessions)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id',           s.id,
    'adminId',      s.admin_id,
    'targetUserId', s.target_user_id,
    'reason',       s.reason,
    'startedAt',    s.started_at,
    'expiresAt',    s.expires_at,
    'endedAt',      s.ended_at,
    'endCause',     s.end_cause,
    'createdAt',    s.created_at,
    'updatedAt',    s.updated_at
  );
$$;
revoke all on function wear.impersonation_session_jsonb(wear.impersonation_sessions) from public;

-- The one gate every reader passes: caller is an admin, the session is theirs,
-- open, and inside the time-box. Raises (fail closed) otherwise; NEVER closes
-- an expired session itself — a raise would roll that close back (see header).
create or replace function wear.impersonation_validate(p_session_id uuid)
returns wear.impersonation_sessions
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s wear.impersonation_sessions;
begin
  if auth.uid() is null or not wear.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_s from wear.impersonation_sessions where id = p_session_id;
  -- Not-found and not-yours are indistinguishable on purpose (no probing).
  if v_s.id is null or v_s.admin_id is distinct from auth.uid() then
    raise exception 'session_not_found';
  end if;
  if v_s.ended_at is not null then
    raise exception 'session_not_active';
  end if;
  if v_s.expires_at <= now() then
    raise exception 'session_expired';
  end if;
  return v_s;
end $$;
revoke all on function wear.impersonation_validate(uuid) from public;

-- Append one audit row. INSERTed by the readers as definer — the log accepts
-- rows from no other path (no client INSERT grant/policy exists).
create or replace function wear.impersonation_audit(
  p_session_id uuid,
  p_action     wear.impersonation_action,
  p_detail     jsonb,
  p_dm_reason  text
) returns void language sql volatile security definer set search_path = '' as $$
  insert into wear.impersonation_actions (session_id, action, detail, dm_reason)
  values (p_session_id, p_action, coalesce(p_detail, '{}'::jsonb), p_dm_reason);
$$;
revoke all on function wear.impersonation_audit(uuid, wear.impersonation_action, jsonb, text) from public;

-- One hydrated feed post, shaped like the app's hydrateFeed output, with the
-- TARGET as the viewer (viewerLiked/viewerSaved). No grants at all: callable
-- only from the definer-context readers — a direct caller could otherwise
-- probe another user's private saved-state post by post.
create or replace function wear.impersonation_post_jsonb(
  p_post_id    uuid,
  p_author_id  uuid,
  p_brand_id   uuid,
  p_body       text,
  p_concept_id uuid,
  p_created_at timestamptz,
  p_target     uuid
) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_post_id,
    'body', p_body,
    'conceptId', p_concept_id,
    'createdAt', p_created_at,
    'author', (select jsonb_build_object(
        'id', u.id, 'handle', u.handle, 'displayName', u.display_name, 'avatarUrl', u.avatar_url)
      from wear.users u where u.id = p_author_id),
    'brand', (select jsonb_build_object(
        'id', b.id, 'slug', b.slug, 'name', b.name, 'verified', b.verified, 'logoUrl', b.logo_url)
      from wear.brands b where b.id = p_brand_id),
    'media', coalesce((select jsonb_agg(jsonb_build_object(
        'url', m.url, 'kind', m.kind, 'altText', m.alt_text) order by m.order_index)
      from wear.post_media m where m.post_id = p_post_id), '[]'::jsonb),
    'likeCount', (select count(*) from wear.likes l where l.post_id = p_post_id),
    'commentCount', (select count(*) from wear.comments c where c.post_id = p_post_id),
    'viewerLiked', exists (
      select 1 from wear.likes l where l.post_id = p_post_id and l.user_id = p_target),
    'viewerSaved', exists (
      select 1 from wear.saved_posts sp
      join wear.save_collections sc on sc.id = sp.collection_id
      where sp.post_id = p_post_id and sc.owner_id = p_target)
  );
$$;
revoke all on function wear.impersonation_post_jsonb(uuid, uuid, uuid, text, uuid, timestamptz, uuid) from public;

-- ── 7. Session lifecycle (the only write path) ──────────────────────────────
create or replace function wear.impersonation_start(p_target uuid, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s          wear.impersonation_sessions;
  v_constraint text;
begin
  if auth.uid() is null or not wear.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 500 then
    raise exception 'reason_required';
  end if;
  if p_target = auth.uid() then
    raise exception 'cannot_impersonate_self';
  end if;
  if not exists (select 1 from wear.users u where u.id = p_target) then
    raise exception 'user_not_found';
  end if;

  -- Self-healing: an EXPIRED-but-unswept session must not hold the partial
  -- unique indexes hostage. Closing here commits with the successful start
  -- (and fires the close-notify trigger for the stale session's target).
  update wear.impersonation_sessions
     set ended_at = expires_at, end_cause = 'expired'
   where ended_at is null
     and expires_at <= now()
     and (admin_id = auth.uid() or target_user_id = p_target);

  begin
    insert into wear.impersonation_sessions (admin_id, target_user_id, reason)
    values (auth.uid(), p_target, btrim(p_reason))
    returning * into v_s;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'impersonation_one_active_per_admin' then
      raise exception 'impersonation_active';
    end if;
    raise exception 'target_under_review';
  end;

  return wear.impersonation_session_jsonb(v_s);
end $$;
revoke all on function wear.impersonation_start(uuid, text) from public, anon;
grant execute on function wear.impersonation_start(uuid, text) to authenticated, service_role;

-- End the caller's session. Works on an EXPIRED-but-open session too (that is
-- how the banner's timer closes cleanly); the recorded cause stays honest.
create or replace function wear.impersonation_end(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s wear.impersonation_sessions;
begin
  if auth.uid() is null or not wear.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_s from wear.impersonation_sessions where id = p_session_id;
  if v_s.id is null or v_s.admin_id is distinct from auth.uid() then
    raise exception 'session_not_found';
  end if;
  if v_s.ended_at is not null then
    raise exception 'session_not_active';
  end if;
  update wear.impersonation_sessions
     set ended_at  = case when now() >= expires_at then expires_at else now() end,
         end_cause = case when now() >= expires_at
                          then 'expired'::wear.impersonation_end_cause
                          else 'admin_exit'::wear.impersonation_end_cause end
   where id = v_s.id
   returning * into v_s;
  return wear.impersonation_session_jsonb(v_s);
end $$;
revoke all on function wear.impersonation_end(uuid) from public, anon;
grant execute on function wear.impersonation_end(uuid) to authenticated, service_role;

-- ── 8. The audited readers (the ONLY way to see the target's view) ──────────
-- Each: validate → write the audit row → return the target's data, exactly as
-- the app composes it for that user. All volatile (they write the log).

-- 8a. Profile — identity, profile, settings VIEW, counts, role, brands, badge.
create or replace function wear.impersonation_view_profile(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s wear.impersonation_sessions;
  v_t uuid;
  v_concepts integer;
begin
  v_s := wear.impersonation_validate(p_session_id);
  v_t := v_s.target_user_id;
  perform wear.impersonation_audit(p_session_id, 'view_profile', '{}'::jsonb, null);

  select count(*)::int into v_concepts from wear.concepts c where c.creator_id = v_t;

  return (
    select jsonb_build_object(
      'user', jsonb_build_object(
        'id', u.id, 'handle', u.handle, 'displayName', u.display_name,
        'avatarUrl', u.avatar_url, 'createdAt', u.created_at),
      'profile', (
        select jsonb_build_object('bio', p.bio, 'visibility', p.visibility, 'verified', p.verified)
        from wear.profiles p where p.user_id = v_t),
      'settings', (
        select jsonb_build_object(
          'displayNameOverride', s.display_name_override,
          'profileVisibility', s.profile_visibility)
        from wear.user_settings s where s.user_id = v_t),
      'role', (
        -- NULL (not 'moderator') for a role-less user: bool_or over zero rows
        -- is NULL, so both arms must stay conditional.
        select case
          when bool_or(r.role = 'admin'::wear.platform_role) then 'admin'
          when count(*) > 0 then 'moderator'
        end
        from wear.user_roles r where r.user_id = v_t),
      'counts', jsonb_build_object(
        'followers', (select count(*) from wear.follows f where f.target_id = v_t),
        'following', (select count(*) from wear.follows f where f.actor_id = v_t),
        'posts',     (select count(*) from wear.posts p where p.author_id = v_t),
        'concepts',  v_concepts),
      -- CREATOR_BADGE_MIN_CONCEPTS = 11 (contract.ts lockstep, mig-161 §6.1).
      'creator', jsonb_build_object(
        'earned', v_concepts >= 11, 'conceptCount', v_concepts, 'threshold', 11),
      'brands', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.id, 'slug', b.slug, 'name', b.name,
          'verified', b.verified, 'logoUrl', b.logo_url) order by b.created_at)
        from wear.brands b where b.owner_user_id = v_t), '[]'::jsonb)
    )
    from wear.users u where u.id = v_t
  );
end $$;
revoke all on function wear.impersonation_view_profile(uuid) from public, anon;
grant execute on function wear.impersonation_view_profile(uuid) to authenticated, service_role;

-- 8b. Feed — BOTH app modes, mirrored exactly (chronological = follows ∪ self
-- newest-first; for-you = 500 newest candidates scored 2*followed + 7-day
-- linear freshness, newest tiebreak). Deliberately NO block filter — the app's
-- feeds apply none (verified in both stores), and "exactly as the user sees
-- it" means exactly.
create or replace function wear.impersonation_view_feed(
  p_session_id uuid,
  p_mode       text default 'for-you',
  p_limit      integer default 20,
  p_offset     integer default 0
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s      wear.impersonation_sessions;
  v_t      uuid;
  v_limit  integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_mode   text    := case when p_mode = 'chronological' then 'chronological' else 'for-you' end;
  v_items  jsonb;
begin
  v_s := wear.impersonation_validate(p_session_id);
  v_t := v_s.target_user_id;
  perform wear.impersonation_audit(
    p_session_id, 'view_feed',
    jsonb_build_object('mode', v_mode, 'limit', v_limit, 'offset', v_offset), null);

  if v_mode = 'chronological' then
    -- feedChronological: posts by (follows ∪ self), newest first.
    select coalesce(jsonb_agg(
             wear.impersonation_post_jsonb(
               pg.id, pg.author_id, pg.brand_id, pg.body, pg.concept_id, pg.created_at, v_t)
             order by pg.created_at desc), '[]'::jsonb)
    into v_items
    from (
      select p.* from wear.posts p
      where p.author_id in (
        select f.target_id from wear.follows f where f.actor_id = v_t
        union select v_t)
      order by p.created_at desc
      limit v_limit offset v_offset
    ) pg;
  else
    -- feedForYou: 500 newest candidates, score = 2*isFollowed + 7-day linear
    -- freshness, newest as tiebreak (the adapter's exact ranker).
    select coalesce(jsonb_agg(
             wear.impersonation_post_jsonb(
               pg.id, pg.author_id, pg.brand_id, pg.body, pg.concept_id, pg.created_at, v_t)
             order by pg.score desc, pg.created_at desc), '[]'::jsonb)
    into v_items
    from (
      select c.*,
             ((case when c.author_id = v_t or exists (
                 select 1 from wear.follows f
                 where f.actor_id = v_t and f.target_id = c.author_id)
               then 2 else 0 end)
              + greatest(0::float8,
                  1 - extract(epoch from (now() - c.created_at)) / (86400 * 7)))::float8 as score
      from (
        select * from wear.posts order by created_at desc limit 500
      ) c
      order by score desc, created_at desc
      limit v_limit offset v_offset
    ) pg;
  end if;

  return jsonb_build_object(
    'mode', v_mode,
    'items', v_items,
    'nextOffset', case when jsonb_array_length(v_items) = v_limit
                       then v_offset + v_limit else null end);
end $$;
revoke all on function wear.impersonation_view_feed(uuid, text, integer, integer) from public, anon;
grant execute on function wear.impersonation_view_feed(uuid, text, integer, integer) to authenticated, service_role;

-- 8c. Saves — the target's PRIVATE boards (owner-only under RLS).
create or replace function wear.impersonation_view_saves(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s wear.impersonation_sessions;
  v_t uuid;
begin
  v_s := wear.impersonation_validate(p_session_id);
  v_t := v_s.target_user_id;
  perform wear.impersonation_audit(p_session_id, 'view_saves', '{}'::jsonb, null);

  return jsonb_build_object('collections', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sc.id,
      'name', sc.name,
      'createdAt', sc.created_at,
      'posts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'body', p.body,
          'createdAt', p.created_at,
          'savedAt', sp.created_at,
          'author', (select jsonb_build_object(
              'handle', u.handle, 'displayName', u.display_name, 'avatarUrl', u.avatar_url)
            from wear.users u where u.id = p.author_id),
          'media', coalesce((select jsonb_agg(jsonb_build_object(
              'url', m.url, 'kind', m.kind, 'altText', m.alt_text) order by m.order_index)
            from wear.post_media m where m.post_id = p.id), '[]'::jsonb)
        ) order by sp.created_at desc)
        from wear.saved_posts sp
        join wear.posts p on p.id = sp.post_id
        where sp.collection_id = sc.id), '[]'::jsonb)
    ) order by sc.created_at)
    from wear.save_collections sc where sc.owner_id = v_t), '[]'::jsonb));
end $$;
revoke all on function wear.impersonation_view_saves(uuid) from public, anon;
grant execute on function wear.impersonation_view_saves(uuid) to authenticated, service_role;

-- 8d. Notifications — the target's inbox (recipient-only under RLS).
create or replace function wear.impersonation_view_notifications(
  p_session_id uuid,
  p_limit      integer default 50
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s     wear.impersonation_sessions;
  v_t     uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  v_s := wear.impersonation_validate(p_session_id);
  v_t := v_s.target_user_id;
  perform wear.impersonation_audit(
    p_session_id, 'view_notifications', jsonb_build_object('limit', v_limit), null);

  return jsonb_build_object(
    'unreadCount', (select count(*) from wear.notifications n
                    where n.recipient_id = v_t and n.read_at is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'type', n.type,
        'data', n.data,
        'conceptId', n.concept_id,
        'brandId', n.brand_id,
        'readAt', n.read_at,
        'createdAt', n.created_at,
        'actor', (select jsonb_build_object(
            'handle', u.handle, 'displayName', u.display_name, 'avatarUrl', u.avatar_url)
          from wear.users u where u.id = n.actor_id)
      ) order by n.created_at desc)
      from (
        select * from wear.notifications
        where recipient_id = v_t
        order by created_at desc
        limit v_limit
      ) n), '[]'::jsonb));
end $$;
revoke all on function wear.impersonation_view_notifications(uuid, integer) from public, anon;
grant execute on function wear.impersonation_view_notifications(uuid, integer) to authenticated, service_role;

-- 8e. Conversation LIST — metadata ONLY. Member identities and timestamps let
-- the admin see the shape of the target's inbox; message BODIES (including
-- any preview) stay behind the per-thread reason gate (§7.2-3).
create or replace function wear.impersonation_view_conversations(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s wear.impersonation_sessions;
  v_t uuid;
begin
  v_s := wear.impersonation_validate(p_session_id);
  v_t := v_s.target_user_id;
  perform wear.impersonation_audit(p_session_id, 'view_conversations', '{}'::jsonb, null);

  return jsonb_build_object('conversations', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'kind', c.kind,
      'name', c.name,
      'updatedAt', c.updated_at,
      'lastReadAt', me.last_read_at,
      'requestState', me.request_state,
      'messageCount', (select count(*) from wear.messages m where m.conversation_id = c.id),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'userId', u.id, 'handle', u.handle,
          'displayName', u.display_name, 'avatarUrl', u.avatar_url) order by u.handle)
        from wear.conversation_members cm
        join wear.users u on u.id = cm.user_id
        where cm.conversation_id = c.id), '[]'::jsonb)
    ) order by c.updated_at desc)
    from wear.conversation_members me
    join wear.conversations c on c.id = me.conversation_id
    where me.user_id = v_t), '[]'::jsonb));
end $$;
revoke all on function wear.impersonation_view_conversations(uuid) from public, anon;
grant execute on function wear.impersonation_view_conversations(uuid) to authenticated, service_role;

-- 8f. DM thread — the §7.2-3 gate: EVERY call logs its own required reason.
create or replace function wear.impersonation_view_dm_thread(
  p_session_id      uuid,
  p_conversation_id uuid,
  p_reason          text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_s wear.impersonation_sessions;
  v_t uuid;
begin
  v_s := wear.impersonation_validate(p_session_id);
  v_t := v_s.target_user_id;
  if p_reason is null or length(btrim(p_reason)) < 5 or length(btrim(p_reason)) > 500 then
    raise exception 'dm_reason_required';
  end if;
  -- Fail closed: a conversation the TARGET is not in does not exist here —
  -- impersonation grants the target's view, never a global one.
  if not exists (
    select 1 from wear.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = v_t
  ) then
    raise exception 'conversation_not_found';
  end if;
  perform wear.impersonation_audit(
    p_session_id, 'view_dm_thread',
    jsonb_build_object('conversationId', p_conversation_id), btrim(p_reason));

  return (
    select jsonb_build_object(
      'conversation', jsonb_build_object('id', c.id, 'kind', c.kind, 'name', c.name),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'userId', u.id, 'handle', u.handle,
          'displayName', u.display_name, 'avatarUrl', u.avatar_url) order by u.handle)
        from wear.conversation_members cm
        join wear.users u on u.id = cm.user_id
        where cm.conversation_id = c.id), '[]'::jsonb),
      'messages', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'authorId', m.author_id,
          'author', (select jsonb_build_object(
              'handle', u.handle, 'displayName', u.display_name, 'avatarUrl', u.avatar_url)
            from wear.users u where u.id = m.author_id),
          -- Soft-deleted messages render as deleted, not as their old body.
          'body', case when m.deleted_at is null then m.body else null end,
          'deleted', m.deleted_at is not null,
          'createdAt', m.created_at
        ) order by m.created_at)
        from (
          select * from wear.messages
          where conversation_id = c.id
          order by created_at desc
          limit 500
        ) m), '[]'::jsonb)
    )
    from wear.conversations c where c.id = p_conversation_id
  );
end $$;
revoke all on function wear.impersonation_view_dm_thread(uuid, uuid, text) from public, anon;
grant execute on function wear.impersonation_view_dm_thread(uuid, uuid, text) to authenticated, service_role;

-- ── 9. Close notification (§7.2-4; mig-159 trigger-only invariant) ──────────
-- Copy (client-composed): "An administrator accessed your account for support
-- on <date>." Institutional voice (actor NULL — the admin's identity is bench
-- material in the audit tables, not inbox material). Payload carries the ids
-- and stamps a future audit-summary surface needs (ratified 7.6c "no link
-- yet, keep the data").
create or replace function wear.notify_on_impersonation_close()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform wear.notify(
    new.target_user_id,
    'account_accessed_by_admin'::wear.notification_type,
    null, null, null,
    jsonb_build_object(
      'sessionId', new.id,
      'startedAt', new.started_at,
      'endedAt',   new.ended_at,
      'date', to_char(new.started_at at time zone 'utc', 'YYYY-MM-DD')));
  return new;
end $$;
revoke all on function wear.notify_on_impersonation_close() from public;
create trigger trg_notify_on_impersonation_close
  after update on wear.impersonation_sessions
  for each row
  when (old.ended_at is null and new.ended_at is not null)
  execute function wear.notify_on_impersonation_close();

-- ── 10. Expiry sweep (the notification guarantee) ───────────────────────────
-- Closes abandoned sessions ≤5 min after their box ends; runs as the job
-- owner (postgres) so RLS/grants don't apply and the close-notify trigger
-- fires. mig-141 registration pattern.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron is not installed — apply migration 120 first';
  end if;

  if exists (select 1 from cron.job where jobname = 'impersonation-expiry-sweep') then
    perform cron.unschedule('impersonation-expiry-sweep');
  end if;

  perform cron.schedule(
    'impersonation-expiry-sweep',
    '*/5 * * * *',
    $cron$
      update wear.impersonation_sessions
         set ended_at = expires_at, end_cause = 'expired'
       where ended_at is null and expires_at <= now();
    $cron$
  );
end $$;

-- ============================================================================
-- Post-apply record (APPLIED 2026-07-17, tag wear-pre-mig163 @8cd6314):
--  * get_advisors(security) = 0 ERROR / 110 WARN / 3 INFO. The +8 WARNs vs the
--    head-162 baseline (0/102/3) are EXACTLY the INTENTIONAL SECDEF EXECUTE
--    grants to authenticated on: impersonation_start, impersonation_end, and
--    the six impersonation_view_* readers (verified by name — the only
--    impersonation-related findings; mig-157 precedent: such grants are the
--    sanctioned R3.2/R3.3 privileged-read pattern; every fn self-guards on
--    wear.is_admin() + session ownership and writes its own audit row).
--    impersonation_validate / impersonation_audit / impersonation_session_jsonb
--    / impersonation_post_jsonb and the three trigger fns hold NO role grants
--    → no WARN surface. 0 unexpected findings.
--  * Rolled-back prod smokes 18/18 PASS (single DO block, final RAISE = zero
--    residue, verified 0 rows after):
--    (a) start as non-admin → 42501 · (b) start(self) → cannot_impersonate_self
--    (c) short reason → reason_required · (d) double-start → impersonation_active
--    (e) second admin, same target → target_under_review
--    (f) another admin's session id → session_not_found
--    (g) dm thread w/ blank reason → dm_reason_required
--    (h) 7 view calls = exactly 7 audit rows; dm row carries its reason
--    (i0) role authenticated CAN execute a reader (the granted path works)
--    (i1) direct INSERT as authenticated → 42501 (no grant)
--    (i2) UPDATE open-session start facts as owner → 'only the close stamp' raise
--    (i3) UPDATE an audit action as owner → 'append-only' raise
--    (i4) UPDATE a CLOSED session as owner → 'immutable once closed' raise
--    (j) end() → endCause=admin_exit + exactly one account_accessed_by_admin
--        notification, actor NULL, data.sessionId = the session
--    (j2) second end() → session_not_active
--    (k) reader on an expired session → session_expired (no state change)
--    (k2) end() of the expired session → endCause=expired + notify fired
--  * Structural QA (verified live): wear tables 38→40, policies 86→88, fns
--    34→49, enums 23→25 (notification_type → 13 values), 4 triggers on the two
--    new tables, cron 'impersonation-expiry-sweep' (*/5) registered.
--  * SHARED_DB_CONTRACT §9 re-stamped (head 163, next # = 164); roles MD §7.5
--    item 1 marked shipped; RESUME_HERE §3AB at session end.
-- ============================================================================
