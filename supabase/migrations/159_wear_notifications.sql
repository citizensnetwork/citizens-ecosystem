-- ============================================================================
-- 159_wear_notifications.sql — Citizens Wear notifications backend (stub)
-- ============================================================================
-- The Inbox "Notifications" tab has been a coming-soon placeholder since Phase 3
-- (RESUME §3L/§3R debt). This migration adds the backend it needs: a single
-- `wear.notifications` table fed by SECDEF triggers on the Concepts-marketplace
-- lifecycle — the natural, already-audited event sources.
--
-- Event → recipient (who cares):
--   proposal submitted     → the concept's CREATOR      (concept_proposal)
--   proposal awarded        → the winning BRAND owner    (concept_awarded)
--   status advanced         → the concept's CREATOR      (concept_advanced)
--   royalty proof submitted → the concept's CREATOR      (royalty_proof)
--   royalty obligation closed → the BRAND owner          (royalty_closed)
--   catalogue conversion proposed → the concept's CREATOR (conversion_proposed)
--   catalogue conversion answered → the BRAND owner       (conversion_responded)
--
-- Why triggers (not extending the mig-157 RPCs): the RPCs are prod-tested and
-- load-bearing; an AFTER trigger fires regardless of the write path and keeps
-- notification logic isolated. A notification targets ANOTHER user (the
-- recipient), which the recipient-only INSERT-less RLS below would block, so the
-- trigger functions are SECURITY DEFINER (definer = table owner) — the same
-- precedent as mig-144's DM-member trigger and mig-157's completed-concept post.
-- Notifications are BEST-EFFORT: `wear.notify` swallows its own insert errors so
-- a notification bug can never roll back an award / advance / royalty transaction.

-- ── Type ────────────────────────────────────────────────────────────────────
create type wear.notification_type as enum (
  'concept_proposal',
  'concept_awarded',
  'concept_advanced',
  'royalty_proof',
  'royalty_closed',
  'conversion_proposed',
  'conversion_responded'
);

-- ── Table ───────────────────────────────────────────────────────────────────
create table wear.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references wear.users(id) on delete cascade,
  type         wear.notification_type not null,
  -- Who caused it (SET NULL like the marketplace audit columns, not a new race
  -- category vs the §3R account-deletion note).
  actor_id     uuid references wear.users(id) on delete set null,
  concept_id   uuid references wear.concepts(id) on delete cascade,
  brand_id     uuid references wear.brands(id) on delete cascade,
  -- Render payload (conceptTitle / brandName / stage / accepted …) so the client
  -- composes the message without extra round-trips; actor identity is hydrated
  -- fresh from wear.users so it never goes stale.
  data         jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_recipient_idx on wear.notifications(recipient_id, created_at desc);
create index notifications_unread_idx on wear.notifications(recipient_id)
  where read_at is null;
alter table wear.notifications enable row level security;

-- Recipient sees / marks-read / clears ONLY their own. No INSERT policy: rows
-- enter solely through the SECDEF triggers below.
create policy notifications_recipient_read on wear.notifications for select
  using (auth.uid() = recipient_id);
create policy notifications_recipient_update on wear.notifications for update
  using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
create policy notifications_recipient_delete on wear.notifications for delete
  using (auth.uid() = recipient_id);

-- ── notify() — the single best-effort emit helper ───────────────────────────
-- Skips null recipients and self-notifications (recipient == actor). Swallows
-- insert errors so notifications are never a transaction hazard for the caller.
create or replace function wear.notify(
  p_recipient uuid,
  p_type      wear.notification_type,
  p_actor     uuid,
  p_concept   uuid,
  p_brand     uuid,
  p_data      jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient is null then return; end if;
  if p_actor is not null and p_actor = p_recipient then return; end if;
  insert into wear.notifications (recipient_id, type, actor_id, concept_id, brand_id, data)
  values (p_recipient, p_type, p_actor, p_concept, p_brand, coalesce(p_data, '{}'::jsonb));
exception when others then
  -- Best-effort: never let a notification failure roll back the caller's write.
  return;
end $$;
revoke all on function wear.notify(uuid, wear.notification_type, uuid, uuid, uuid, jsonb) from public;

-- ── Trigger: proposal submitted → concept creator ───────────────────────────
create or replace function wear.notify_on_proposal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_creator uuid; v_title text; v_brand wear.brands;
begin
  select creator_id, title into v_creator, v_title from wear.concepts where id = new.concept_id;
  select * into v_brand from wear.brands where id = new.brand_id;
  perform wear.notify(
    v_creator, 'concept_proposal', v_brand.owner_user_id, new.concept_id, new.brand_id,
    jsonb_build_object('conceptTitle', v_title, 'brandName', v_brand.name)
  );
  return new;
end $$;
revoke all on function wear.notify_on_proposal() from public;
create trigger trg_notify_on_proposal
  after insert on wear.concept_proposals
  for each row execute function wear.notify_on_proposal();

-- ── Trigger: proposal awarded → winning brand owner ─────────────────────────
create or replace function wear.notify_on_award()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_title text; v_brand wear.brands;
begin
  select * into v_brand from wear.brands where id = new.brand_id;
  select title into v_title from wear.concepts where id = new.concept_id;
  perform wear.notify(
    v_brand.owner_user_id, 'concept_awarded', new.awarded_by, new.concept_id, new.brand_id,
    jsonb_build_object('conceptTitle', v_title, 'brandName', v_brand.name)
  );
  return new;
end $$;
revoke all on function wear.notify_on_award() from public;
create trigger trg_notify_on_award
  after insert on wear.concept_claims
  for each row execute function wear.notify_on_award();

-- ── Trigger: status advanced → concept creator ──────────────────────────────
-- The initial 'claimed' log row is authored by the creator (award RPC), so the
-- self-notify guard in wear.notify() drops it automatically; later advances are
-- authored by the brand owner and reach the creator.
create or replace function wear.notify_on_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_creator uuid; v_title text;
begin
  select creator_id, title into v_creator, v_title from wear.concepts where id = new.concept_id;
  perform wear.notify(
    v_creator, 'concept_advanced', new.created_by, new.concept_id, null,
    jsonb_build_object('conceptTitle', v_title, 'stage', new.status::text, 'note', new.note)
  );
  return new;
end $$;
revoke all on function wear.notify_on_status() from public;
create trigger trg_notify_on_status
  after insert on wear.concept_status_log
  for each row execute function wear.notify_on_status();

-- ── Trigger: royalty proof submitted / obligation closed ────────────────────
create or replace function wear.notify_on_royalty()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_creator uuid; v_brand_owner uuid; v_brand_id uuid; v_concept_id uuid; v_title text;
begin
  select c.creator_id, b.owner_user_id, cl.brand_id, c.id, c.title
    into v_creator, v_brand_owner, v_brand_id, v_concept_id, v_title
  from wear.concept_claims cl
  join wear.brands b on b.id = cl.brand_id
  join wear.concepts c on c.id = cl.concept_id
  where cl.id = new.claim_id;

  -- Proof of the milestone sale just submitted → the creator confirms close-out.
  if new.proof_submitted_at is distinct from old.proof_submitted_at
     and new.proof_submitted_at is not null then
    perform wear.notify(
      v_creator, 'royalty_proof', v_brand_owner, v_concept_id, v_brand_id,
      jsonb_build_object('conceptTitle', v_title)
    );
  end if;

  -- Obligation closed by the creator/admin → tell the brand owner it's settled.
  -- A close that is part of a catalogue conversion (milestone superseded by the
  -- lifetime royalty) is skipped: the brand owner already gets 'conversion_
  -- responded', and the MemoryWearStore closes it inline without a separate
  -- notification — this keeps the two stores in lockstep.
  if new.closed_at is distinct from old.closed_at and new.closed_at is not null
     and coalesce(new.closed_note, '') <> 'superseded by catalogue conversion (lifetime 5%)' then
    perform wear.notify(
      v_brand_owner, 'royalty_closed', new.closed_by, v_concept_id, v_brand_id,
      jsonb_build_object('conceptTitle', v_title)
    );
  end if;

  return new;
end $$;
revoke all on function wear.notify_on_royalty() from public;
create trigger trg_notify_on_royalty
  after update on wear.royalty_obligations
  for each row execute function wear.notify_on_royalty();

-- ── Trigger: catalogue conversion proposed → concept creator ────────────────
create or replace function wear.notify_on_conversion_propose()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_creator uuid; v_brand_id uuid; v_concept_id uuid; v_title text;
begin
  select c.creator_id, cl.brand_id, c.id, c.title
    into v_creator, v_brand_id, v_concept_id, v_title
  from wear.concept_claims cl
  join wear.concepts c on c.id = cl.concept_id
  where cl.id = new.claim_id;
  perform wear.notify(
    v_creator, 'conversion_proposed', new.proposed_by, v_concept_id, v_brand_id,
    jsonb_build_object('conceptTitle', v_title)
  );
  return new;
end $$;
revoke all on function wear.notify_on_conversion_propose() from public;
create trigger trg_notify_on_conversion_propose
  after insert on wear.catalogue_conversions
  for each row execute function wear.notify_on_conversion_propose();

-- ── Trigger: catalogue conversion answered → brand owner ────────────────────
create or replace function wear.notify_on_conversion_respond()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_brand_owner uuid; v_brand_id uuid; v_concept_id uuid; v_title text;
begin
  select b.owner_user_id, cl.brand_id, c.id, c.title
    into v_brand_owner, v_brand_id, v_concept_id, v_title
  from wear.concept_claims cl
  join wear.brands b on b.id = cl.brand_id
  join wear.concepts c on c.id = cl.concept_id
  where cl.id = new.claim_id;
  perform wear.notify(
    v_brand_owner, 'conversion_responded', new.responded_by, v_concept_id, v_brand_id,
    jsonb_build_object('conceptTitle', v_title, 'accepted', new.status = 'accepted')
  );
  return new;
end $$;
revoke all on function wear.notify_on_conversion_respond() from public;
create trigger trg_notify_on_conversion_respond
  after update on wear.catalogue_conversions
  for each row
  when (old.status = 'proposed' and new.status in ('accepted', 'declined'))
  execute function wear.notify_on_conversion_respond();

-- ── Grants (least-privilege; RLS gates every row) ───────────────────────────
-- Recipient reads / marks-read / clears their own; NO insert grant (trigger-only).
grant select, update, delete on wear.notifications to authenticated;
grant all on wear.notifications to service_role;
