-- 149_vision_advisory_engine.sql
-- Vision Phase B, item 8 (VISION_BACKEND_WIRING_SPEC §3.1c / §3.7c / §6.2 / §8):
-- the advisory evaluation engine + its 6-hourly cron + a seed of universal,
-- org-type-agnostic advisory templates and rules. This is what turns the
-- Advisories surface (banner + dedicated screen) from an empty honesty-stub
-- (RESUME §3Q) into a live insight feed.
--
-- Design notes / deviations from the spec §3.7c sketch:
--   1. The spec sketch calls "the mig-148 readers" to resolve metric values.
--      Those readers (reach_per_org/engagement_per_org/calendar_growth/
--      retention_rate) are membership-gated (is_org_member OR is_platform_admin
--      → 42501). This engine runs from a service_role cron with no auth.uid(),
--      so it CANNOT call them. Instead it inlines the equivalent service-role
--      queries against the same views (reach_per_event / engagement_per_event)
--      and reuses vision.org_active_persons for retention — identical maths,
--      no gate. (A SECURITY DEFINER fn executes as its owner, which owns and
--      may EXECUTE org_active_persons despite its service_role-only grant.)
--   2. Metric-slug resolution is the hardcoded map the spec recommends as the
--      simplest first step (§3.7c, Open Decision #4 = start hardcoded). Slugs
--      the map does not recognise (incl. the six mig-137 seed rules —
--      goal_alignment_pct, milestone_completion_pct, etc. — whose metrics are
--      not built yet) resolve to NULL and are skipped. Only wired metrics fire:
--      honest by construction.
--   3. Noise guards protect the smallest org (VISION.md litmus #3 + the
--      "never worse than the demo" constraint): growth needs a previous-window
--      reach base >= 10; retention needs a previous person base >= 3;
--      engagement is only judged when there was activity in the window; the
--      quiet-period nudge only fires for orgs that had prior activity (a
--      just-linked org is never told it "went quiet").
--   4. Identity: advisory_outputs.org_id is the VISION org id; every metric is
--      computed against the CONNECT contributor id resolved via the mig-142
--      bridge (vision.organisations.connect_contributor_id). events.date is
--      timestamptz → all window boundaries are org-local (profiles.timezone,
--      default Africa/Johannesburg), consistent with migs 147/148.
--
-- Display Convention #8 (spec §5): every advisory carries its numerator and
-- denominator in advisory_outputs.data (the frontend renders "92% (11/12)").

-- ── 1. Template placeholder substitution ────────────────────────────────
-- Replaces every {key} in the template with data->>key. SECURITY INVOKER
-- (pure string work, touches no table); internal to the engine.
create or replace function vision.advisory_fill(
  p_template text,
  p_data     jsonb
) returns text
language plpgsql immutable
set search_path = pg_catalog
as $$
declare
  v_out text := p_template;
  v_key text;
  v_val text;
begin
  if p_data is null then
    return v_out;
  end if;
  for v_key, v_val in select key, value from jsonb_each_text(p_data) loop
    v_out := replace(v_out, '{' || v_key || '}', coalesce(v_val, ''));
  end loop;
  return v_out;
end;
$$;

revoke all on function vision.advisory_fill(text, jsonb) from public, anon, authenticated;
grant execute on function vision.advisory_fill(text, jsonb) to service_role;

-- ── 2. The advisory evaluation engine (spec §3.7c) ──────────────────────
-- For every linked org × every active rule: resolve the metric (hardcoded
-- slug map), apply operator + threshold, respect the rule's cooldown, and
-- insert a template-substituted advisory_output. Returns the number of new
-- advisories generated (cron-log observability). SECURITY DEFINER + owner-
-- executed → bypasses advisory_outputs RLS to write for any org.
create or replace function vision.evaluate_advisory_rules(
  p_org_id uuid default null   -- NULL = evaluate every linked org
) returns integer
language plpgsql volatile security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_org   record;
  v_rule  record;
  v_count integer := 0;
  v_val   numeric;
  v_data  jsonb;
  v_fires boolean;
  v_title text;
  v_body  text;
  -- window boundaries (per rule — lookback varies)
  v_yest       date;
  v_cur_start  date;
  v_cur_end    date;
  v_prev_start date;
  v_prev_end   date;
  -- metric scratch
  v_cur_reach  bigint;
  v_prev_reach bigint;
  v_eng        numeric;
  v_ec         integer;
  v_cur_arr    uuid[];
  v_prev_arr   uuid[];
  v_prev_n     integer;
  v_ret_n      integer;
  v_had_prior  boolean;
begin
  for v_org in
    select o.id as org_id,
           o.connect_contributor_id as cc_id,
           coalesce(p.timezone, 'Africa/Johannesburg') as tz
    from vision.organisations o
    join public.profiles p on p.id = o.connect_contributor_id
    where o.connect_contributor_id is not null
      and (p_org_id is null or o.id = p_org_id)
  loop
    for v_rule in
      select r.id as rule_id, r.template_id, r.metric_slug, r.operator,
             r.threshold, r.lookback_days, r.cooldown_hours,
             t.title_template, t.body_template, t.severity
      from vision.advisory_rules r
      join vision.advisory_templates t on t.id = r.template_id
      where r.active = true and t.active = true
    loop
      v_val  := null;
      v_data := '{}'::jsonb;

      v_yest       := (now() at time zone v_org.tz)::date - 1;
      v_cur_end    := v_yest;
      v_cur_start  := v_yest - v_rule.lookback_days + 1;
      v_prev_end   := v_cur_start - 1;
      v_prev_start := v_prev_end - v_rule.lookback_days + 1;

      -- ── hardcoded metric-slug → value map ──
      if v_rule.metric_slug = 'growth_reach_pct' then
        select coalesce(sum(r.reach), 0) into v_cur_reach
        from vision.reach_per_event r
        join public.events e on e.id = r.event_id
        where r.org_id = v_org.cc_id
          and (e.date at time zone v_org.tz)::date between v_cur_start and v_cur_end;

        select coalesce(sum(r.reach), 0) into v_prev_reach
        from vision.reach_per_event r
        join public.events e on e.id = r.event_id
        where r.org_id = v_org.cc_id
          and (e.date at time zone v_org.tz)::date between v_prev_start and v_prev_end;

        if v_prev_reach >= 10 then
          v_val  := round((v_cur_reach - v_prev_reach)::numeric / v_prev_reach * 100, 1);
          v_data := jsonb_build_object(
            'pct',      v_val::text,
            'abs_pct',  abs(v_val)::text,
            'current',  v_cur_reach::text,
            'previous', v_prev_reach::text,
            'period',   v_rule.lookback_days || ' days');
        end if;

      elsif v_rule.metric_slug = 'retention_pct' then
        select array_agg(t.uid) into v_prev_arr
        from vision.org_active_persons(v_org.cc_id, v_org.tz, v_prev_start, v_prev_end, null) as t(uid);
        v_prev_n := coalesce(array_length(v_prev_arr, 1), 0);

        if v_prev_n >= 3 then
          select array_agg(t.uid) into v_cur_arr
          from vision.org_active_persons(v_org.cc_id, v_org.tz, v_cur_start, v_cur_end, null) as t(uid);
          select count(*) into v_ret_n
          from unnest(coalesce(v_cur_arr, '{}'::uuid[])) c(uid)
          where c.uid = any(v_prev_arr);
          v_val  := round(v_ret_n::numeric / v_prev_n * 100, 1);
          v_data := jsonb_build_object(
            'pct',       v_val::text,
            'returning', v_ret_n::text,
            'previous',  v_prev_n::text,
            'period',    v_rule.lookback_days || ' days');
        end if;

      elsif v_rule.metric_slug = 'engagement_score' then
        select round(coalesce(avg(g.engagement_score), 0), 2), count(*)
        into v_eng, v_ec
        from vision.engagement_per_event g
        join public.events e on e.id = g.event_id
        where g.org_id = v_org.cc_id
          and (e.date at time zone v_org.tz)::date between v_cur_start and v_cur_end;

        if v_ec > 0 then
          v_val  := v_eng;
          v_data := jsonb_build_object(
            'value',  v_eng::text,
            'events', v_ec::text,
            'period', v_rule.lookback_days || ' days');
        end if;

      elsif v_rule.metric_slug = 'activity_count' then
        select count(*) into v_ec
        from public.events e
        where e.created_by = v_org.cc_id
          and (e.date at time zone v_org.tz)::date between v_cur_start and v_cur_end;

        select exists (
          select 1 from public.events e
          where e.created_by = v_org.cc_id
            and (e.date at time zone v_org.tz)::date < v_cur_start
        ) into v_had_prior;

        if v_had_prior then
          v_val  := v_ec;
          v_data := jsonb_build_object(
            'count',  v_ec::text,
            'period', v_rule.lookback_days || ' days');
        end if;
      end if;

      -- unknown slug or guard failed → nothing to evaluate
      if v_val is null then
        continue;
      end if;

      v_fires := case v_rule.operator
        when '<'  then v_val <  v_rule.threshold
        when '<=' then v_val <= v_rule.threshold
        when '>'  then v_val >  v_rule.threshold
        when '>=' then v_val >= v_rule.threshold
        when '='  then v_val =  v_rule.threshold
        when '!=' then v_val <> v_rule.threshold
        else false
      end;

      if v_fires is not true then
        continue;
      end if;

      -- cooldown: skip if this rule already produced output for this org
      -- within cooldown_hours (dismissed ones count — no immediate re-fire).
      if exists (
        select 1 from vision.advisory_outputs ao
        where ao.org_id = v_org.org_id
          and ao.rule_id = v_rule.rule_id
          and ao.created_at > now() - make_interval(hours => v_rule.cooldown_hours)
      ) then
        continue;
      end if;

      v_title := vision.advisory_fill(v_rule.title_template, v_data);
      v_body  := vision.advisory_fill(v_rule.body_template, v_data);

      insert into vision.advisory_outputs (
        org_id, template_id, rule_id, title, body, severity, data
      ) values (
        v_org.org_id, v_rule.template_id, v_rule.rule_id,
        v_title, v_body, v_rule.severity, v_data
      );

      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function vision.evaluate_advisory_rules(uuid) from public, anon, authenticated;
grant execute on function vision.evaluate_advisory_rules(uuid) to service_role;

-- ── 3. Seed: universal, org-type-agnostic templates + rules ─────────────
-- Constrained to the advisory_templates.type CHECK domain (mig 137): the two
-- universal buckets are trend_alert (declines / nudges) and impact_highlight
-- (positives). Every body is worded for ANY org type and every ratio carries
-- its counts. Guarded so a re-apply is a no-op.
do $$
declare
  tpl uuid;
begin
  if exists (
    select 1 from vision.advisory_rules
    where metric_slug in ('growth_reach_pct', 'retention_pct',
                          'engagement_score', 'activity_count')
  ) then
    return;
  end if;

  -- 1. Reach climbing (positive)
  insert into vision.advisory_templates (type, title_template, body_template, severity)
  values ('impact_highlight', 'Your reach is climbing',
    'Reach grew {pct}% over the last {period} — {current} people reached, up from {previous}. Momentum is building; keep the rhythm going.',
    'info')
  returning id into tpl;
  insert into vision.advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
  values (tpl, 'growth_reach_pct', '>', 25, 30, 168);

  -- 2. Reach dipping (warning)
  insert into vision.advisory_templates (type, title_template, body_template, severity)
  values ('trend_alert', 'Reach has dipped',
    'Reach fell {abs_pct}% over the last {period} — {current} people reached, down from {previous}. A fresh activity or a broadcast to your audience can help turn this around.',
    'warning')
  returning id into tpl;
  insert into vision.advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
  values (tpl, 'growth_reach_pct', '<', -25, 30, 168);

  -- 3. Fewer people returning (warning)
  insert into vision.advisory_templates (type, title_template, body_template, severity)
  values ('trend_alert', 'Fewer people are returning',
    'Only {pct}% of last period''s people came back ({returning} of {previous}). A follow-up that invites them to the next thing can rebuild the rhythm.',
    'warning')
  returning id into tpl;
  insert into vision.advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
  values (tpl, 'retention_pct', '<', 40, 30, 168);

  -- 4. Engagement is strong (positive)
  insert into vision.advisory_templates (type, title_template, body_template, severity)
  values ('impact_highlight', 'Engagement is strong',
    'Your engagement score is {value}/100 across {events} activities this {period} — people aren''t just showing up, they''re taking part.',
    'info')
  returning id into tpl;
  insert into vision.advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
  values (tpl, 'engagement_score', '>=', 60, 30, 168);

  -- 5. It's gone quiet (nudge)
  insert into vision.advisory_templates (type, title_template, body_template, severity)
  values ('trend_alert', 'It''s gone quiet',
    'No activity has been logged in the last {period}. Even a small update or a single event keeps your community connected.',
    'info')
  returning id into tpl;
  insert into vision.advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
  values (tpl, 'activity_count', '<=', 0, 30, 168);
end $$;

-- ── 4. Cron: evaluate every 6 hours (spec §6.2) ─────────────────────────
-- Rules carry cooldown_hours for dedup, so a 6-hourly cadence is safe.
-- cron.schedule upserts by job name (same pattern as mig 148 jobs 11/12).
select cron.schedule(
  'vision_advisory_eval',
  '0 */6 * * *',
  'SELECT vision.evaluate_advisory_rules();'
);
