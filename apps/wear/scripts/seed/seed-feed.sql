-- ============================================================================
-- seed-feed.sql — Citizens Wear launch feed seed (original, Kingdom-aligned)
-- ----------------------------------------------------------------------------
-- Seeds 5 ORIGINAL faith-rooted brands (no real-company impersonation), each a
-- FULL Wear identity, plus 2 community "citizen" personas, posts, a follow
-- graph, likes/comments, stories, and ONE realized Concepts-marketplace item
-- (proposed -> awarded -> released) so the attribution chip renders in-feed.
--
-- DESIGN NOTES
--  * Founder request (no cross-platform footprint): brand owners MUST exist in
--    auth.users (wear.users.id FK -> auth.users ON DELETE CASCADE), and the
--    on_auth_user_created trigger auto-creates a Connect public.profiles row.
--    We DELETE those rows in-transaction, so the seed identities have ZERO
--    Connect presence — they exist only in wear.* (see the broader "lazy
--    per-platform profiles" recommendation in RESUME_HERE §3S).
--  * Idempotent: bails if the seed is already present (checks a fixed owner id).
--  * Fully reversible: teardown-feed.sql deletes the 7 seed auth.users; every
--    wear.* row cascades away (verified ON DELETE CASCADE on all seed FKs).
--  * The Concept lifecycle is driven through the REAL SECURITY DEFINER RPCs
--    (award/advance) under an impersonated request.jwt.claims — same path the
--    app uses — so triggers (milestone royalty, auto Completed-Concept post,
--    media copy) fire exactly as in production.
--  * Media is URL-only (no upload pipeline yet): tasteful Unsplash CDN photos
--    for posts/concepts, ui-avatars for brand logos/citizen avatars. All were
--    HTTP-checked 200 at seed time.
--
-- Run: MCP execute_sql (postgres/bypassrls) or psql. Re-runnable (no-op if seeded).
-- ============================================================================
do $seed$
declare
  -- ── fixed seed identities (also the teardown key) ──
  o1 uuid := '5eed0001-0000-4000-a000-000000000001'; -- Cornerstone Apparel owner
  o2 uuid := '5eed0002-0000-4000-a000-000000000002'; -- Lily & Field owner
  o3 uuid := '5eed0003-0000-4000-a000-000000000003'; -- Salt & Light Threads owner
  o4 uuid := '5eed0004-0000-4000-a000-000000000004'; -- Ubuntu Kingdom Co. owner
  o5 uuid := '5eed0005-0000-4000-a000-000000000005'; -- Anchor & Crown owner
  c1 uuid := '5eed0011-0000-4000-a000-000000000011'; -- Grace Lethabo (concept creator)
  c2 uuid := '5eed0012-0000-4000-a000-000000000012'; -- Thabo M.
  br1 uuid := '5eedb001-0000-4000-a000-0000000000b1';
  br2 uuid := '5eedb002-0000-4000-a000-0000000000b2';
  br3 uuid := '5eedb003-0000-4000-a000-0000000000b3';
  br4 uuid := '5eedb004-0000-4000-a000-0000000000b4';
  br5 uuid := '5eedb005-0000-4000-a000-0000000000b5';
  -- founder accounts (already real) — followed so their feeds are alive
  founder  uuid := '4a1b3802-4e9d-40ef-bd8d-7ec8b4d242ca';
  founder2 uuid := 'c01ec5c3-2737-4ef0-a2b5-6c5dde3ad589';
  -- captured ids
  pc1 uuid; pc2 uuid; pl1 uuid; ps1 uuid; ps2 uuid; pu1 uuid; pa1 uuid; pcomp uuid;
  concept1 uuid := gen_random_uuid();
  prop1 uuid; -- Cornerstone proposal (awarded)
  meta_app jsonb := '{"provider":"email","providers":["email"]}';
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  if exists (select 1 from auth.users where id = o1) then
    raise notice 'wear feed seed already present — skipping';
    return;
  end if;

  -- ── 1) auth.users (7 seed identities; no password → not sign-in-able) ──
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
  values
    (o1, inst,'authenticated','authenticated','cornerstone.apparel@seed.citizenscentral.co.za', now(), meta_app, '{"full_name":"Cornerstone Apparel"}', now()-interval '26 days', now(), false, false),
    (o2, inst,'authenticated','authenticated','lily.field@seed.citizenscentral.co.za',        now(), meta_app, '{"full_name":"Lily & Field"}',        now()-interval '24 days', now(), false, false),
    (o3, inst,'authenticated','authenticated','salt.light@seed.citizenscentral.co.za',         now(), meta_app, '{"full_name":"Salt & Light Threads"}', now()-interval '22 days', now(), false, false),
    (o4, inst,'authenticated','authenticated','ubuntu.kingdom@seed.citizenscentral.co.za',      now(), meta_app, '{"full_name":"Ubuntu Kingdom Co."}',   now()-interval '20 days', now(), false, false),
    (o5, inst,'authenticated','authenticated','anchor.crown@seed.citizenscentral.co.za',        now(), meta_app, '{"full_name":"Anchor & Crown"}',       now()-interval '18 days', now(), false, false),
    (c1, inst,'authenticated','authenticated','grace.lethabo@seed.citizenscentral.co.za',       now(), meta_app, '{"full_name":"Grace Lethabo"}',        now()-interval '27 days', now(), false, false),
    (c2, inst,'authenticated','authenticated','thabo.m@seed.citizenscentral.co.za',             now(), meta_app, '{"full_name":"Thabo M."}',             now()-interval '25 days', now(), false, false);

  -- ── 2) remove the auto-created Connect profiles (zero cross-platform footprint) ──
  delete from public.profiles where id in (o1,o2,o3,o4,o5,c1,c2);

  -- ── 3) wear.users mirror (handle + display name + avatar) ──
  insert into wear.users (id, handle, display_name, avatar_url, created_at) values
    (o1,'cornerstoneapparel','Cornerstone Apparel','https://ui-avatars.com/api/?name=Cornerstone&background=1a1a1a&color=fff&size=256&bold=true', now()-interval '26 days'),
    (o2,'lilyandfield','Lily & Field','https://ui-avatars.com/api/?name=Lily+Field&background=b8860b&color=fff&size=256&bold=true', now()-interval '24 days'),
    (o3,'saltandlightthreads','Salt & Light Threads','https://ui-avatars.com/api/?name=Salt+Light&background=3f6f34&color=fff&size=256&bold=true', now()-interval '22 days'),
    (o4,'ubuntukingdomco','Ubuntu Kingdom Co.','https://ui-avatars.com/api/?name=Ubuntu+Kingdom&background=8f4a2b&color=fff&size=256&bold=true', now()-interval '20 days'),
    (o5,'anchorandcrown','Anchor & Crown','https://ui-avatars.com/api/?name=Anchor+Crown&background=1a1a1a&color=fff&size=256&bold=true', now()-interval '18 days'),
    (c1,'gracelethabo','Grace Lethabo','https://ui-avatars.com/api/?name=Grace+Lethabo&background=b8860b&color=fff&size=256&bold=true', now()-interval '27 days'),
    (c2,'thabo_m','Thabo M.','https://ui-avatars.com/api/?name=Thabo+M&background=3f6f34&color=fff&size=256&bold=true', now()-interval '25 days');

  -- ── 4) wear.profiles (bio; visibility default public; verified stays false) ──
  insert into wear.profiles (user_id, bio) values
    (o1, $t$Ethically made streetwear from Pretoria. Every piece points back to the Cornerstone. — Ephesians 2:20$t$),
    (o2, $t$Neither toil nor spin. Quiet, considered pieces for everyday grace. — Matthew 6:28$t$),
    (o3, $t$Conversation-starting tees. 10% of every order goes to inner-city missions. — Matthew 5:14$t$),
    (o4, $t$Hand-knit by a collective of makers in Mamelodi. Made by the Body, for the Body.$t$),
    (o5, $t$Faith-forward caps and accessories. Hope as an anchor for the soul. — Hebrews 6:19$t$),
    (c1, $t$Following Jesus in Tshwane. Lover of good design and good coffee.$t$),
    (c2, $t$Youth pastor. Sneakerhead. Kingdom first.$t$);

  -- ── 5) wear.brands (verified=false; verification below flips 3) ──
  insert into wear.brands (id, slug, name, tagline, logo_url, owner_user_id, created_at) values
    (br1,'cornerstone-apparel','Cornerstone Apparel',$t$Streetwear built on the Rock.$t$,'https://ui-avatars.com/api/?name=Cornerstone&background=1a1a1a&color=fff&size=256&bold=true',o1, now()-interval '26 days'),
    (br2,'lily-and-field','Lily & Field',$t$Considered, modest womenswear.$t$,'https://ui-avatars.com/api/?name=Lily+Field&background=b8860b&color=fff&size=256&bold=true',o2, now()-interval '24 days'),
    (br3,'salt-and-light-threads','Salt & Light Threads',$t$Tees that start conversations.$t$,'https://ui-avatars.com/api/?name=Salt+Light&background=3f6f34&color=fff&size=256&bold=true',o3, now()-interval '22 days'),
    (br4,'ubuntu-kingdom-co','Ubuntu Kingdom Co.',$t$Community-woven knitwear.$t$,'https://ui-avatars.com/api/?name=Ubuntu+Kingdom&background=8f4a2b&color=fff&size=256&bold=true',o4, now()-interval '20 days'),
    (br5,'anchor-and-crown','Anchor & Crown',$t$Hope as an anchor — caps & accessories.$t$,'https://ui-avatars.com/api/?name=Anchor+Crown&background=1a1a1a&color=fff&size=256&bold=true',o5, now()-interval '18 days');

  -- ── 6) brand verification: 3 approved (sync trigger flips verified), 2 pending ──
  insert into wear.brand_verifications (brand_id, status, note, requested_by, reviewed_by, reviewed_at, review_note) values
    (br1,'approved',$t$Registered in Pretoria; small-batch ethical manufacturer.$t$, o1, founder, now()-interval '21 days', $t$Welcome to the marketplace.$t$),
    (br3,'approved',$t$Give-back model verified with two partner missions.$t$,       o3, founder, now()-interval '19 days', $t$Approved — love the mission.$t$),
    (br4,'approved',$t$Mamelodi makers collective; fair-wage documentation on file.$t$,o4, founder, now()-interval '17 days', $t$Approved.$t$);
  insert into wear.brand_verifications (brand_id, status, note, requested_by) values
    (br2,'pending',$t$Modest womenswear label — happy to share registration + lookbook.$t$, o2),
    (br5,'pending',$t$Accessories maker; can provide supplier details on request.$t$,       o5);

  -- ── 7) posts (+ one image each) ──
  insert into wear.posts (author_id, brand_id, body, created_at) values
    (o1, br1, $t$Drop 01 is live. The "Cornerstone" heavyweight tee — 240gsm, boxy fit, Psalm 118:22 printed across the back. Built to last, made to point back to Him. 🏗️$t$, now()-interval '9 days') returning id into pc1;
  insert into wear.posts (author_id, brand_id, body, created_at) values
    (o1, br1, $t$Behind every stitch: our small team in Pretoria West. Slow fashion, fair wages, Kingdom values. Streetwear with a foundation.$t$, now()-interval '4 days') returning id into pc2;
  insert into wear.posts (author_id, brand_id, body, created_at) values
    (o2, br2, $t$The Field dress in olive — one considered piece, endlessly wearable. "Consider the lilies of the field…" 🌿 Restocked this week.$t$, now()-interval '6 days') returning id into pl1;
  insert into wear.posts (author_id, brand_id, body, created_at) values
    (o3, br3, $t$New tee: LIGHT OF THE WORLD. Wear it, start a conversation. 10% of this drop funds a soup kitchen in the inner city. 🧂✨$t$, now()-interval '7 days') returning id into ps1;
  insert into wear.posts (author_id, brand_id, body, created_at) values
    (o3, br3, $t$Every order writes a story. This month your purchases put 42 meals into the city. Thank you, family. 🙏$t$, now()-interval '2 days') returning id into ps2;
  insert into wear.posts (author_id, brand_id, body, created_at) values
    (o4, br4, $t$The Mamelodi Collective just finished the winter run — 60 hand-knit jerseys, each signed by its maker. "I am because we are." 🧶$t$, now()-interval '5 days') returning id into pu1;
  insert into wear.posts (author_id, brand_id, body, created_at) values
    (o5, br5, $t$The Anchor cap, embroidered in gold thread. Hebrews 6:19 — hope as an anchor for the soul. ⚓👑 Pre-orders open.$t$, now()-interval '3 days') returning id into pa1;

  insert into wear.post_media (post_id, url, alt_text) values
    (pc1,'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=70',$t$Folded heavyweight tees$t$),
    (pc2,'https://images.unsplash.com/photo-1503341504253-dff4815485f1?auto=format&fit=crop&w=800&q=70',$t$Streetwear portrait$t$),
    (pl1,'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=800&q=70',$t$Considered womenswear piece$t$),
    (ps1,'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=800&q=70',$t$Rack of printed tees$t$),
    (ps2,'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?auto=format&fit=crop&w=800&q=70',$t$Give-back accessories flatlay$t$),
    (pu1,'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=800&q=70',$t$Hand-knit jersey$t$),
    (pa1,'https://images.unsplash.com/photo-1588099768523-f4e6a5679d88?auto=format&fit=crop&w=800&q=70',$t$Embroidered cap$t$);

  -- ── 8) follow graph (community follows brands; brands support each other; founder feeds alive) ──
  insert into wear.follows (actor_id, target_id) values
    (c1,o1),(c1,o2),(c1,o3),(c1,o4),(c1,o5),
    (c2,o1),(c2,o3),(c2,o4),(c2,o5),
    (o1,o3),(o1,c1),(o1,c2),
    (o3,o1),(o3,o4),(o3,c1),
    (o4,o1),(o4,o3),(o4,c1),(o4,c2),
    (o2,o1),(o2,o3),
    (o5,o3),(o5,c1),
    (founder,o1),(founder,o2),(founder,o3),(founder,o4),(founder,o5),
    (founder2,o1),(founder2,o2),(founder2,o3),(founder2,o4),(founder2,o5);

  -- ── 9) likes + comments ──
  insert into wear.likes (post_id, user_id) values
    (pc1,o3),(pc1,o4),(pc1,c1),(pc1,c2),(pc1,founder),
    (pc2,c1),(pc2,o2),(pc2,founder2),
    (pl1,o1),(pl1,c1),(pl1,c2),
    (ps1,o1),(ps1,o4),(ps1,c1),(ps1,c2),(ps1,founder),
    (ps2,c1),(ps2,o3),
    (pu1,o1),(pu1,o3),(pu1,c1),(pu1,c2),(pu1,founder),(pu1,founder2),
    (pa1,o3),(pa1,c1),(pa1,c2);

  insert into wear.comments (post_id, author_id, body) values
    (pc1,c1,$t$This is beautiful — the Psalm across the back is such a nice touch. 🙌$t$),
    (pc1,c2,$t$Cop. Ordering the black one today.$t$),
    (ps1,c1,$t$Love that it funds meals. Bought two.$t$),
    (pu1,c2,$t$Hand-knit AND signed by the maker? Incredible work.$t$),
    (pu1,o1,$t$So proud to share this city with you all. 🧶$t$),
    (pa1,c1,$t$That gold anchor detail 👑$t$),
    (pl1,c2,$t$My wife is going to love this.$t$);

  -- ── 10) stories (14-day expiry so the launch tray stays alive) ──
  insert into wear.stories (author_id, brand_id, media_url, caption, expires_at) values
    (o1, br1, 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=800&q=70', $t$Drop 01 — live now.$t$,        now()+interval '14 days'),
    (o3, br3, 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=800&q=70', $t$42 meals funded this month 🧂$t$, now()+interval '14 days'),
    (o4, br4, 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=70',  $t$Winter run — hand-knit.$t$,      now()+interval '14 days'),
    (c1, null,'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?auto=format&fit=crop&w=800&q=70', $t$Obsessed with my new Salt & Light tee ✨$t$, now()+interval '14 days');

  -- ── 11) Concepts marketplace: one realized item, driven via the real RPCs ──
  insert into wear.concepts (id, creator_id, title, description, created_at) values
    (concept1, c1, $t$The Living Water hoodie$t$,
     $t$A heavyweight hoodie in deep river-blue, with "whoever drinks the water I give will never thirst" (John 4:14) embroidered small inside the hood. Ethically made, a numbered edition. Who can bring this to life for the Body?$t$,
     now()-interval '15 days');
  insert into wear.concept_media (concept_id, url, alt_text) values
    (concept1,'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=800&q=70',$t$River-blue hoodie concept$t$);
  insert into wear.concept_upvotes (concept_id, user_id) values
    (concept1,o1),(concept1,o3),(concept1,o4),(concept1,c2),(concept1,founder);

  -- two verified brands pitch (details private; public sees brand tags only)
  insert into wear.concept_proposals (concept_id, brand_id, status, materials, est_unit_price, moq, est_turnaround_days, note)
    values (concept1, br1, 'submitted', $t$400gsm organic brushed fleece, water-based interior print$t$, 449.00, 100, 35,
            $t$This is exactly our weight — we would be honoured to make it in Pretoria.$t$)
    returning id into prop1;
  insert into wear.concept_proposals (concept_id, brand_id, status, materials, note)
    values (concept1, br3, 'submitted', $t$360gsm cotton loopback$t$,
            $t$We could tie a city-missions give-back to every unit.$t$);

  -- creator (Grace) awards Cornerstone → claim + milestone royalty + 'claimed' log
  perform set_config('request.jwt.claims', json_build_object('sub', c1::text, 'role','authenticated')::text, true);
  perform wear.award_concept_claim(prop1);

  -- awarded brand (Cornerstone) advances the lifecycle; 'released' auto-creates
  -- the Completed-Concept post and copies the concept artwork.
  perform set_config('request.jwt.claims', json_build_object('sub', o1::text, 'role','authenticated')::text, true);
  perform wear.advance_concept_status(concept1, 'in_production', $t$Sampling the river-blue fleece in Pretoria.$t$);
  perform wear.advance_concept_status(concept1, 'released',      $t$Live now — a numbered edition of 100.$t$);
  perform set_config('request.jwt.claims', '', true);

  -- engagement on the auto-generated Completed-Concept post
  select id into pcomp from wear.posts
    where concept_id = concept1 and brand_id = br1 order by created_at desc limit 1;
  if pcomp is not null then
    insert into wear.likes (post_id, user_id) values
      (pcomp,c1),(pcomp,o3),(pcomp,o4),(pcomp,c2),(pcomp,founder),(pcomp,founder2)
      on conflict do nothing;
    insert into wear.comments (post_id, author_id, body) values
      (pcomp,c1,$t$Seeing my idea come to life for the Body — I am so thankful. 💧$t$),
      (pcomp,o5,$t$Congratulations to you both. This is exactly what the marketplace is for.$t$);
  end if;

  raise notice 'wear feed seed applied (brands=5, concept=released, footprint=wear-only)';
end $seed$;
