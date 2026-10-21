-- ════════════════════════════════════════════════════════════════════
--  Rollback-only probe for migration 196_listing_claim_verify_first (C10, GitHub #159).
--  Run AFTER the apply, in the SQL editor / MCP execute_sql. (The draft is numbered 196; if the file is renumbered at apply time this
--  probe is renamed with it.) It builds synthetic users only: an existing Citizen who confirms, one who says "Not me", an
--  address that was never verified, a stranger, an admin, an owner who signs in AS the placeholder, and a placeholder an admin hid.
--  It ends with RAISE EXCEPTION, so the whole transaction rolls back and NOTHING persists. One line per check, PASS or FAIL.
--  Nothing here names a real person or organisation (all addresses are *.example / *.invalid).
-- ════════════════════════════════════════════════════════════════════
do $probe$
declare
  adm uuid := gen_random_uuid();         -- an admin
  own uuid := gen_random_uuid();         -- an existing Citizen with a VERIFIED address: will Confirm
  dcl uuid := gen_random_uuid();         -- an existing Citizen with a VERIFIED address: will say "Not me"
  unv uuid := gen_random_uuid();         -- an account whose address was typed but never verified
  str uuid := gen_random_uuid();         -- a stranger with no listing waiting
  fre uuid := gen_random_uuid();         -- the owner of a FRESH address: signs in AS the placeholder
  hid uuid := gen_random_uuid();         -- an existing Citizen whose waiting listing an admin hid
  ctr uuid := gen_random_uuid();         -- an existing CONTRIBUTOR (already has a listing of their own) with a listing waiting
  p_ctr uuid := gen_random_uuid();
  rev uuid := gen_random_uuid();         -- an existing Citizen whose request was declined and whose listing an admin later un-hid
  p_rev uuid := gen_random_uuid();
  fru uuid := gen_random_uuid();         -- signed in AS a placeholder, but the address was never verified
  p_own uuid := gen_random_uuid();       -- placeholders (alias addresses, never mailed)
  p_dec uuid := gen_random_uuid();
  p_unv uuid := gen_random_uuid();
  p_hid uuid := gen_random_uuid();
  -- p_fre IS fre: the placeholder holds the real address
  r jsonb; n bigint; ok boolean; s text; res text[] := '{}'; msg text;
  led_status text; led_claimant uuid; hidden boolean; role_ text; slug_ text; name_ text; st text;
begin
  -- Setup runs as the service role (the same way the routes write), so the role/status guards let the synthetic rows be made.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  insert into auth.users (id, email, email_confirmed_at) values
    (adm, 'probe-admin@probe.example', now()),
    (own, 'probe-owner@probe.example', now()),
    (dcl, 'probe-decliner@probe.example', now()),
    (unv, 'probe-unverified@probe.example', null),
    (str, 'probe-stranger@probe.example', now()),
    (fre, 'probe-fresh@probe.example', now()),
    (hid, 'probe-hidden@probe.example', now()),
    (ctr, 'probe-contrib@probe.example', now()),
    (rev, 'probe-revived@probe.example', now()),
    (p_rev, 'listing-' || p_rev || '@listing-placeholder.invalid', now()),
    (fru, 'probe-unverified-self@probe.example', null),
    (p_ctr, 'listing-' || p_ctr || '@listing-placeholder.invalid', now()),
    (p_own, 'listing-' || p_own || '@listing-placeholder.invalid', now()),
    (p_dec, 'listing-' || p_dec || '@listing-placeholder.invalid', now()),
    (p_unv, 'listing-' || p_unv || '@listing-placeholder.invalid', now()),
    (p_hid, 'listing-' || p_hid || '@listing-placeholder.invalid', now());

  update public.profiles set role = 'admin', full_name = 'Probe Admin' where id = adm;
  update public.profiles set full_name = 'Probe Owner' where id = own;
  update public.profiles set full_name = 'Probe Decliner' where id = dcl;
  update public.profiles set full_name = 'Probe Unverified' where id = unv;
  update public.profiles set full_name = 'Probe Stranger' where id = str;
  update public.profiles set full_name = 'Probe Hidden Owner' where id = hid;
  update public.profiles set role = 'contributor', contributor_status = 'approved', full_name = 'Probe Own Listing', contributor_slug = 'probe-own-listing', contributor_category = 'church' where id = ctr;
  update public.profiles set role = 'contributor', contributor_status = 'approved', full_name = 'Probe Org Seven', contributor_slug = 'probe-org-seven', contributor_category = 'church', contributor_kind = 'organization', contributor_claim_email = 'probe-revived@probe.example' where id = p_rev;
  update public.profiles set role = 'contributor', contributor_status = 'approved', full_name = 'Probe Org Eight', contributor_slug = 'probe-org-eight', contributor_category = 'church', contributor_kind = 'organization', contributor_claim_email = 'probe-unverified-self@probe.example' where id = fru;
  update public.profiles set role = 'contributor', contributor_status = 'approved', full_name = 'Probe Org Six', contributor_slug = 'probe-org-six', contributor_category = 'church', contributor_kind = 'organization', contributor_claim_email = 'probe-contrib@probe.example' where id = p_ctr;

  -- The five waiting listings: live Contributors under placeholders, with the real address in contributor_claim_email.
  update public.profiles set role = 'contributor', contributor_status = 'approved', full_name = 'Probe Org One',
         contributor_slug = 'probe-org-one', contributor_category = 'church', contributor_kind = 'organization',
         contributor_claim_email = 'probe-owner@probe.example' where id = p_own;
  update public.profiles set role = 'contributor', contributor_status = 'approved', full_name = 'Probe Org Two',
         contributor_slug = 'probe-org-two', contributor_category = 'church', contributor_kind = 'organization',
         contributor_claim_email = 'probe-decliner@probe.example' where id = p_dec;
  update public.profiles set role = 'contributor', contributor_status = 'approved', full_name = 'Probe Org Three',
         contributor_slug = 'probe-org-three', contributor_category = 'church', contributor_kind = 'organization',
         contributor_claim_email = 'probe-unverified@probe.example' where id = p_unv;
  update public.profiles set role = 'contributor', contributor_status = 'approved', full_name = 'Probe Org Four',
         contributor_slug = 'probe-org-four', contributor_category = 'church', contributor_kind = 'organization',
         contributor_claim_email = 'probe-hidden@probe.example' where id = p_hid;
  update public.profiles set role = 'contributor', contributor_status = 'approved', full_name = 'Probe Org Five',
         contributor_slug = 'probe-org-five', contributor_category = 'church', contributor_kind = 'organization',
         contributor_claim_email = 'probe-fresh@probe.example' where id = fre;

  insert into public.listing_claims (placeholder_id, slug, claim_email, source) values
    (p_own, 'probe-org-one', 'probe-owner@probe.example', 'google_form'),
    (p_dec, 'probe-org-two', 'probe-decliner@probe.example', 'admin_create'),
    (p_unv, 'probe-org-three', 'probe-unverified@probe.example', 'google_form'),
    (p_hid, 'probe-org-four', 'probe-hidden@probe.example', 'google_form'),
    (fre, 'probe-org-five', 'probe-fresh@probe.example', 'google_form'),
    (p_ctr, 'probe-org-six', 'probe-contrib@probe.example', 'google_form'),
    (fru, 'probe-org-eight', 'probe-unverified-self@probe.example', 'google_form');
  insert into public.listing_claims (placeholder_id, slug, claim_email, source, status, decided_at)
    values (p_rev, 'probe-org-seven', 'probe-revived@probe.example', 'google_form', 'declined', now());
  update public.profiles set contributor_hidden = true where id = p_hid;   -- an admin hid it after approval

  -- ── table shape ────────────────────────────────────────────────────
  begin insert into public.listing_claims (placeholder_id, slug, claim_email, source) values (p_own, 'x', 'probe-owner2@probe.example', 'google_form');
    res := array_append(res, 'FAIL a second ledger row for one placeholder was accepted');
  exception when unique_violation then res := array_append(res, 'PASS one ledger row per placeholder'); end;
  begin insert into public.listing_claims (placeholder_id, slug, claim_email, source) values (str, 'x', 'probe-owner@probe.example', 'google_form');
    res := array_append(res, 'FAIL two awaiting rows for one address were accepted');
  exception when unique_violation then res := array_append(res, 'PASS at most one awaiting request per address'); end;
  begin insert into public.listing_claims (placeholder_id, slug, claim_email, source) values (str, 'x', 'Probe-Upper@probe.example', 'google_form');
    res := array_append(res, 'FAIL a mixed-case address was accepted');
  exception when check_violation then res := array_append(res, 'PASS the address must be stored lower-case'); end;
  begin insert into public.listing_claims (placeholder_id, slug, claim_email, source, status) values (str, 'x', 'probe-x@probe.example', 'google_form', 'declined');
    res := array_append(res, 'FAIL a declined row with no decided_at was accepted');
  exception when check_violation then res := array_append(res, 'PASS a decided row needs decided_at (and an awaiting row must not have one)'); end;
  begin insert into public.listing_claims (placeholder_id, slug, claim_email, source) values (str, 'x', 'probe-x@probe.example', 'carrier_pigeon');
    res := array_append(res, 'FAIL an unknown source was accepted');
  exception when check_violation then res := array_append(res, 'PASS source is one of google_form, admin_create, legacy'); end;

  -- ── grants (the new-table footgun) ─────────────────────────────────
  res := array_append(res, (case when not has_table_privilege('anon', 'public.listing_claims', 'select') then 'PASS' else 'FAIL' end) || ' anon has no SELECT on the ledger');
  res := array_append(res, (case when not has_table_privilege('authenticated', 'public.listing_claims', 'insert')
                                  and not has_table_privilege('authenticated', 'public.listing_claims', 'update')
                                  and not has_table_privilege('authenticated', 'public.listing_claims', 'delete')
                                  and not has_table_privilege('authenticated', 'public.listing_claims', 'truncate') then 'PASS' else 'FAIL' end)
                              || ' authenticated cannot INSERT / UPDATE / DELETE / TRUNCATE the ledger');
  res := array_append(res, (case when not has_function_privilege('anon', 'public.peek_claimable_listing()', 'execute')
                                  and not has_function_privilege('anon', 'public.decline_listing_claim()', 'execute')
                                  and not has_function_privilege('anon', 'public.claim_admin_created_contributor()', 'execute')
                                  and not has_function_privilege('anon', 'public.mark_own_listing_claimed()', 'execute') then 'PASS' else 'FAIL' end)
                              || ' anon can run none of the four claim functions');
  res := array_append(res, (case when has_function_privilege('authenticated', 'public.peek_claimable_listing()', 'execute')
                                  and has_function_privilege('authenticated', 'public.decline_listing_claim()', 'execute') then 'PASS' else 'FAIL' end)
                              || ' signed-in users can run peek and decline');

  -- ── anon ───────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin perform 1 from public.listing_claims; res := array_append(res, 'FAIL anon can read the ledger');
  exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot read the ledger'); end;
  begin perform public.peek_claimable_listing(); res := array_append(res, 'FAIL anon can run peek');
  exception when insufficient_privilege then res := array_append(res, 'PASS anon cannot run peek'); end;
  execute 'reset role';

  -- ── signed in, but no user (auth.uid() is null) ────────────────────
  execute 'set local role authenticated';
  r := public.peek_claimable_listing();
  res := array_append(res, (case when (r->>'found')::boolean is false and r->>'reason' = 'not_authenticated' then 'PASS' else 'FAIL' end) || ' peek without a user -> not_authenticated');
  r := public.claim_admin_created_contributor();
  res := array_append(res, (case when r->>'reason' = 'not_authenticated' then 'PASS' else 'FAIL' end) || ' claim without a user -> not_authenticated');
  r := public.mark_own_listing_claimed();
  res := array_append(res, (case when r->>'reason' = 'not_authenticated' then 'PASS' else 'FAIL' end) || ' mark_own without a user -> not_authenticated');
  r := public.decline_listing_claim();
  res := array_append(res, (case when r->>'reason' = 'not_authenticated' then 'PASS' else 'FAIL' end) || ' decline without a user -> not_authenticated');
  execute 'reset role';

  -- ── a stranger: nothing is waiting for them, and they cannot see or write the ledger ─────
  perform set_config('request.jwt.claims', json_build_object('sub', str, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', str::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.listing_claims;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end) || ' a non-admin reads 0 ledger rows (got ' || n || ')');
  begin insert into public.listing_claims (placeholder_id, slug, claim_email, source) values (str, 'x', 'probe-y@probe.example', 'google_form');
    res := array_append(res, 'FAIL a signed-in user could insert a ledger row');
  exception when insufficient_privilege then res := array_append(res, 'PASS a signed-in user cannot insert a ledger row'); end;
  r := public.peek_claimable_listing();
  res := array_append(res, (case when (r->>'found')::boolean is false then 'PASS' else 'FAIL' end) || ' peek for a stranger finds nothing');
  r := public.claim_admin_created_contributor();
  res := array_append(res, (case when r->>'reason' = 'nothing_to_claim' then 'PASS' else 'FAIL' end) || ' claim by a stranger -> nothing_to_claim (' || coalesce(r->>'reason', '?') || ')');
  r := public.decline_listing_claim();
  res := array_append(res, (case when r->>'reason' = 'nothing_to_decline' then 'PASS' else 'FAIL' end) || ' decline by a stranger -> nothing_to_decline');
  r := public.mark_own_listing_claimed();
  res := array_append(res, (case when r->>'reason' = 'nothing_to_mark' then 'PASS' else 'FAIL' end) || ' mark_own by a stranger -> nothing_to_mark');
  execute 'reset role';

  -- ── an address that was never verified cannot claim, decline or even be told ─────
  perform set_config('request.jwt.claims', json_build_object('sub', unv, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', unv::text, true);
  execute 'set local role authenticated';
  r := public.peek_claimable_listing();
  res := array_append(res, (case when (r->>'found')::boolean is false and r->>'reason' = 'email_not_verified' then 'PASS' else 'FAIL' end) || ' peek for an UNVERIFIED address -> email_not_verified (the listing is not even named)');
  r := public.claim_admin_created_contributor();
  res := array_append(res, (case when r->>'reason' = 'email_not_verified' then 'PASS' else 'FAIL' end) || ' claim by an UNVERIFIED address is refused');
  r := public.decline_listing_claim();
  res := array_append(res, (case when r->>'reason' = 'email_not_verified' then 'PASS' else 'FAIL' end) || ' decline by an UNVERIFIED address is refused');
  execute 'reset role';
  select status into led_status from public.listing_claims where placeholder_id = p_unv;
  select role into role_ from public.profiles where id = unv;
  res := array_append(res, (case when led_status = 'awaiting' and role_ = 'citizen' then 'PASS' else 'FAIL' end) || ' ...and nothing moved: the request is still awaiting and the account is unchanged');

  -- ── the owner who will Confirm ─────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', own::text, true);
  execute 'set local role authenticated';
  r := public.peek_claimable_listing();
  res := array_append(res, (case when (r->>'found')::boolean and r->>'mode' = 'attach' and (r->>'eligible')::boolean and r->>'name' = 'Probe Org One' and r->>'slug' = 'probe-org-one' then 'PASS' else 'FAIL' end) || ' peek shows the owner the listing in attach mode');
  res := array_append(res, (case when not (r ? 'claim_email') and not (r ? 'email') and r::text not like '%@%' then 'PASS' else 'FAIL' end) || ' ...and carries no email address');
  execute 'reset role';
  select role into role_ from public.profiles where id = own;
  select contributor_hidden into hidden from public.profiles where id = p_own;
  res := array_append(res, (case when role_ = 'citizen' and hidden is not true then 'PASS' else 'FAIL' end) || ' peek changed nothing (account still a Citizen, listing still live)');

  execute 'set local role authenticated';
  r := public.claim_admin_created_contributor();
  res := array_append(res, (case when (r->>'success')::boolean and r->>'slug' = 'probe-org-one' then 'PASS' else 'FAIL' end) || ' Confirm attaches the listing and the slug moves with it (got ' || coalesce(r->>'slug', r->>'reason', '?') || ')');
  execute 'reset role';
  select role, contributor_status, contributor_slug, full_name, contributor_hidden into role_, st, slug_, name_, hidden from public.profiles where id = own;
  res := array_append(res, (case when role_ = 'contributor' and st = 'approved' and slug_ = 'probe-org-one' and name_ = 'Probe Org One' and hidden is not true then 'PASS' else 'FAIL' end) || ' the owner''s own account is now the Contributor');
  select contributor_hidden, contributor_slug into hidden, slug_ from public.profiles where id = p_own;
  res := array_append(res, (case when hidden is true and slug_ is null then 'PASS' else 'FAIL' end) || ' the placeholder is hidden and gave its slug up');
  select status, claimant_id into led_status, led_claimant from public.listing_claims where placeholder_id = p_own;
  res := array_append(res, (case when led_status = 'confirmed' and led_claimant = own then 'PASS' else 'FAIL' end) || ' the ledger says confirmed, by the owner');

  -- replay: Confirm again, Not me after Confirm, and another account trying the same listing
  execute 'set local role authenticated';
  r := public.claim_admin_created_contributor();
  res := array_append(res, (case when (r->>'success')::boolean is not true then 'PASS' else 'FAIL' end) || ' a second Confirm does nothing (' || coalesce(r->>'reason', '?') || ')');
  r := public.decline_listing_claim();
  res := array_append(res, (case when r->>'reason' = 'nothing_to_decline' then 'PASS' else 'FAIL' end) || ' Not me after Confirm does nothing');
  r := public.peek_claimable_listing();
  res := array_append(res, (case when (r->>'found')::boolean is false then 'PASS' else 'FAIL' end) || ' peek no longer offers it');
  execute 'reset role';

  -- ── the owner who says "Not me" ────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', dcl, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', dcl::text, true);
  execute 'set local role authenticated';
  r := public.decline_listing_claim();
  res := array_append(res, (case when (r->>'success')::boolean and r->>'name' = 'Probe Org Two' and r->>'slug' = 'probe-org-two' then 'PASS' else 'FAIL' end) || ' Not me succeeds and names the listing for the admin');
  execute 'reset role';
  select contributor_hidden into hidden from public.profiles where id = p_dec;
  res := array_append(res, (case when hidden is true then 'PASS' else 'FAIL' end) || ' ...the placeholder is hidden at once');
  select role, contributor_status, full_name, contributor_slug into role_, st, name_, slug_ from public.profiles where id = dcl;
  res := array_append(res, (case when role_ = 'citizen' and st = 'not_applied' and name_ = 'Probe Decliner' and slug_ is null then 'PASS' else 'FAIL' end) || ' ...and nothing on the existing account changed');
  select status into led_status from public.listing_claims where placeholder_id = p_dec;
  res := array_append(res, (case when led_status = 'declined' then 'PASS' else 'FAIL' end) || ' ...the ledger says declined');
  execute 'set local role authenticated';
  r := public.claim_admin_created_contributor();
  res := array_append(res, (case when r->>'reason' = 'nothing_to_claim' then 'PASS' else 'FAIL' end) || ' Confirm after Not me does nothing (declined is final)');
  execute 'reset role';

  -- ── a listing an admin hid while it waited cannot be attached ──────
  perform set_config('request.jwt.claims', json_build_object('sub', hid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', hid::text, true);
  execute 'set local role authenticated';
  r := public.peek_claimable_listing();
  res := array_append(res, (case when (r->>'found')::boolean is false then 'PASS' else 'FAIL' end) || ' peek does not offer a listing an admin hid');
  r := public.claim_admin_created_contributor();
  res := array_append(res, (case when r->>'reason' = 'nothing_to_claim' then 'PASS' else 'FAIL' end) || ' ...and the claim refuses it');
  execute 'reset role';

  -- ── the owner of a fresh address signs in AS the placeholder ───────
  perform set_config('request.jwt.claims', json_build_object('sub', fre, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fre::text, true);
  execute 'set local role authenticated';
  r := public.peek_claimable_listing();
  res := array_append(res, (case when (r->>'found')::boolean and r->>'mode' = 'self' then 'PASS' else 'FAIL' end) || ' peek: mode self when the owner signed in as the listing account');
  execute 'reset role';
  select contributor_claimed_at is null into ok from public.profiles where id = fre;
  res := array_append(res, (case when ok then 'PASS' else 'FAIL' end) || ' ...and signing in alone stamped nothing');
  execute 'set local role authenticated';
  r := public.mark_own_listing_claimed();
  res := array_append(res, (case when (r->>'success')::boolean and r->>'slug' = 'probe-org-five' then 'PASS' else 'FAIL' end) || ' Confirm records it');
  r := public.mark_own_listing_claimed();
  res := array_append(res, (case when r->>'reason' = 'nothing_to_mark' then 'PASS' else 'FAIL' end) || ' ...once only');
  execute 'reset role';
  select status, claimant_id into led_status, led_claimant from public.listing_claims where placeholder_id = fre;
  res := array_append(res, (case when led_status = 'confirmed' and led_claimant = fre then 'PASS' else 'FAIL' end) || ' the ledger says confirmed');
  select contributor_claimed_at is not null and contributor_claim_email is null into ok from public.profiles where id = fre;
  res := array_append(res, (case when ok then 'PASS' else 'FAIL' end) || ' ...and the listing account is stamped claimed');

  -- the unverified self case, and a declined request whose listing an admin un-hid (declined stays final)
  perform set_config('request.jwt.claims', json_build_object('sub', fru, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', fru::text, true);
  execute 'set local role authenticated';
  r := public.mark_own_listing_claimed();
  res := array_append(res, (case when r->>'reason' = 'email_not_verified' then 'PASS' else 'FAIL' end) || ' Confirm as the listing account with an UNVERIFIED address is refused');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', rev, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', rev::text, true);
  execute 'set local role authenticated';
  r := public.claim_admin_created_contributor();
  res := array_append(res, (case when r->>'reason' = 'nothing_to_claim' then 'PASS' else 'FAIL' end) || ' a declined request cannot be confirmed even if its listing is live again');
  execute 'reset role';

  -- ── someone who already has a listing of their own is not silently overwritten ──
  perform set_config('request.jwt.claims', json_build_object('sub', ctr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ctr::text, true);
  execute 'set local role authenticated';
  r := public.peek_claimable_listing();
  res := array_append(res, (case when (r->>'found')::boolean and (r->>'eligible')::boolean is false then 'PASS' else 'FAIL' end) || ' peek tells an existing Contributor the listing cannot be attached (eligible false)');
  r := public.claim_admin_created_contributor();
  res := array_append(res, (case when r->>'reason' = 'not_eligible' then 'PASS' else 'FAIL' end) || ' ...and the claim refuses (not_eligible)');
  execute 'reset role';
  select full_name, contributor_slug into name_, slug_ from public.profiles where id = ctr;
  select status into led_status from public.listing_claims where placeholder_id = p_ctr;
  res := array_append(res, (case when name_ = 'Probe Own Listing' and slug_ = 'probe-own-listing' and led_status = 'awaiting' then 'PASS' else 'FAIL' end) || ' ...their own listing is untouched and the request still waits');

  -- ── function hardening ─────────────────────────────────────────────
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname in ('peek_claimable_listing', 'claim_admin_created_contributor', 'mark_own_listing_claimed', 'decline_listing_claim')
     and p.prosecdef and p.proconfig @> array['search_path=""'];
  res := array_append(res, (case when n = 4 then 'PASS' else 'FAIL' end) || ' all four functions are SECURITY DEFINER with search_path = empty (' || n || ' of 4)');

  -- ── an admin can read the ledger (and only an admin) ───────────────
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.listing_claims;
  res := array_append(res, (case when n >= 7 then 'PASS' else 'FAIL' end) || ' an admin reads the ledger (' || n || ' rows)');
  execute 'reset role';

  raise exception '%', array_to_string(res, E'\n');
exception when others then
  get stacked diagnostics msg = message_text;
  if msg like '%PASS%' or msg like '%FAIL%' then
    raise exception '%', msg;
  end if;
  raise exception '%', array_to_string(res, E'\n') || E'\nFAIL probe stopped early: ' || msg;
end
$probe$;
