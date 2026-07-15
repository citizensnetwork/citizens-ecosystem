import { describe, expect, it } from 'vitest';
import { MemoryWearStore } from '../src/index';
import type { WearBrand, WearUser } from '../src/index';

/**
 * Contract tests for the mig-157 Concepts marketplace repos. These cases ARE
 * the semantic spec `SupabaseWearStore` must satisfy — each mirrors an RLS
 * policy or SECURITY DEFINER RPC guard from `157_wear_concepts_marketplace.sql`
 * (and the rolled-back prod smokes that validated it).
 */

const T0 = '2026-07-14T00:00:00.000Z';

const user = (id: string): WearUser => ({
  id,
  handle: id,
  displayName: id,
  avatarUrl: null,
  createdAt: T0,
  updatedAt: T0,
});

const brand = (id: string, ownerUserId: string, verified = false): WearBrand => ({
  id,
  slug: id,
  name: id,
  tagline: null,
  websiteUrl: null,
  logoUrl: null,
  verified,
  ownerUserId,
  connectContributorId: null,
  createdAt: T0,
  updatedAt: T0,
});

/** creator usr_c · brand owner usr_b (brand brd_1, verified) · admin usr_a. */
function makeStore(options?: { verified?: boolean }) {
  let tick = 0;
  return new MemoryWearStore({
    // Strictly increasing clock so recency sorts are deterministic.
    now: () => new Date(Date.parse(T0) + tick++ * 1000),
    seedUsers: [user('usr_c'), user('usr_b'), user('usr_x'), user('usr_a'), user('usr_m')],
    seedBrands: [brand('brd_1', 'usr_b', options?.verified ?? true)],
    seedRoles: [
      { userId: 'usr_a', role: 'admin' },
      { userId: 'usr_m', role: 'moderator' },
    ],
  });
}

async function seedConcept(store: MemoryWearStore, creatorId = 'usr_c') {
  return store.concepts.create({
    creatorId,
    title: 'Lion of Judah tee',
    description: 'Gold-line lion.',
    media: [{ url: 'https://cdn.test/art.png', kind: 'image', altText: 'art', orderIndex: 0 }],
  });
}

/** concept → proposal → award, returning the ids the flows need. */
async function seedAwarded(store: MemoryWearStore) {
  const { concept } = await seedConcept(store);
  const proposal = await store.conceptProposals.create('usr_b', {
    conceptId: concept.id,
    brandId: 'brd_1',
    note: 'We specialise in gold-line prints.',
  });
  const claim = await store.conceptClaims.award(proposal.id, 'usr_c');
  return { concept, proposal, claim };
}

describe('ConceptRepo', () => {
  it('creates a proposed concept with media and lists newest-first', async () => {
    const store = makeStore();
    const a = await seedConcept(store);
    expect(a.concept.status).toBe('proposed');
    expect(a.media).toHaveLength(1);

    await store.concepts.create({ creatorId: 'usr_x', title: 'Second' });
    const page = await store.concepts.list();
    expect(page.items.map((c) => c.concept.title)).toEqual(['Second', 'Lion of Judah tee']);

    const mine = await store.concepts.list({ creatorId: 'usr_c' });
    expect(mine.items).toHaveLength(1);
  });

  it('rejects an empty title', async () => {
    const store = makeStore();
    await expect(store.concepts.create({ creatorId: 'usr_c', title: '  ' })).rejects.toMatchObject({
      code: 'empty_concept',
    });
  });

  it('only the creator edits, and only while proposed', async () => {
    const store = makeStore();
    const { concept } = await seedConcept(store);
    await expect(
      store.concepts.update(concept.id, 'usr_x', { title: 'Hijack' }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    const updated = await store.concepts.update(concept.id, 'usr_c', { title: 'Renamed' });
    expect(updated.concept.title).toBe('Renamed');

    await store.conceptProposals.create('usr_b', { conceptId: concept.id, brandId: 'brd_1' });
    const proposals = await store.conceptProposals.listForConcept(concept.id, 'usr_c');
    await store.conceptClaims.award(proposals[0]!.id, 'usr_c');
    await expect(
      store.concepts.update(concept.id, 'usr_c', { title: 'Too late' }),
    ).rejects.toMatchObject({ code: 'concept_not_open' });
    await expect(store.concepts.delete(concept.id, 'usr_c')).rejects.toMatchObject({
      code: 'concept_not_open',
    });
  });

  it('moderator takedown works at any stage', async () => {
    const store = makeStore();
    const { concept } = await seedAwarded(store);
    await store.concepts.delete(concept.id, 'usr_m');
    expect(await store.concepts.getById(concept.id)).toBeNull();
    expect(await store.conceptClaims.getActiveForConcept(concept.id)).toBeNull();
  });

  it('upvotes are idempotent and countable', async () => {
    const store = makeStore();
    const { concept } = await seedConcept(store);
    await store.concepts.upvote(concept.id, 'usr_x');
    await store.concepts.upvote(concept.id, 'usr_x');
    await store.concepts.upvote(concept.id, 'usr_b');
    expect(await store.concepts.upvoteCount(concept.id)).toBe(2);
    expect(await store.concepts.hasUpvoted(concept.id, 'usr_x')).toBe(true);
    await store.concepts.removeUpvote(concept.id, 'usr_x');
    expect(await store.concepts.upvoteCount(concept.id)).toBe(1);
  });
});

describe('ConceptProposalRepo', () => {
  it('denies an unverified brand (the smoke-b rule)', async () => {
    const store = makeStore({ verified: false });
    const { concept } = await seedConcept(store);
    await expect(
      store.conceptProposals.create('usr_b', { conceptId: concept.id, brandId: 'brd_1' }),
    ).rejects.toMatchObject({ code: 'brand_not_verified' });
  });

  it('denies a non-owner, a closed concept, a block, and a duplicate', async () => {
    const store = makeStore();
    const { concept } = await seedConcept(store);
    await expect(
      store.conceptProposals.create('usr_x', { conceptId: concept.id, brandId: 'brd_1' }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    await store.conceptProposals.create('usr_b', { conceptId: concept.id, brandId: 'brd_1' });
    await expect(
      store.conceptProposals.create('usr_b', { conceptId: concept.id, brandId: 'brd_1' }),
    ).rejects.toMatchObject({ code: 'proposal_exists' });

    const other = await store.concepts.create({ creatorId: 'usr_x', title: 'Blocked concept' });
    await store.blocks.block('usr_x', 'usr_b');
    await expect(
      store.conceptProposals.create('usr_b', { conceptId: other.concept.id, brandId: 'brd_1' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('keeps details party-scoped but exposes public brand tags', async () => {
    const store = makeStore();
    const { concept } = await seedConcept(store);
    const proposal = await store.conceptProposals.create('usr_b', {
      conceptId: concept.id,
      brandId: 'brd_1',
      estUnitPrice: 199,
    });

    // Party reads: creator, brand owner, moderator. Outsider sees null/[].
    expect(await store.conceptProposals.getById(proposal.id, 'usr_c')).not.toBeNull();
    expect(await store.conceptProposals.getById(proposal.id, 'usr_b')).not.toBeNull();
    expect(await store.conceptProposals.getById(proposal.id, 'usr_m')).not.toBeNull();
    expect(await store.conceptProposals.getById(proposal.id, 'usr_x')).toBeNull();
    expect(await store.conceptProposals.listForConcept(concept.id, 'usr_x')).toHaveLength(0);

    // The public surface carries brand tags ONLY (no pricing details).
    const tags = await store.conceptProposals.publicTags(concept.id);
    expect(tags).toEqual([{ brandId: 'brd_1', proposedAt: expect.any(String) }]);

    await store.conceptProposals.withdraw(proposal.id, 'usr_b');
    expect(await store.conceptProposals.publicTags(concept.id)).toHaveLength(0);
  });

  it('withdraw stays possible unverified; resubmit needs verification + open concept', async () => {
    const store = makeStore();
    const { concept } = await seedConcept(store);
    const proposal = await store.conceptProposals.create('usr_b', {
      conceptId: concept.id,
      brandId: 'brd_1',
    });

    // Verification lapses mid-bid (admin revoke) — withdraw still allowed.
    await store.brandVerifications.request('brd_1', 'usr_b');
    await store.brandVerifications.review('brd_1', 'usr_a', 'revoked');
    const withdrawn = await store.conceptProposals.withdraw(proposal.id, 'usr_b');
    expect(withdrawn.status).toBe('withdrawn');

    // ...but re-entering needs verification again.
    await expect(store.conceptProposals.resubmit(proposal.id, 'usr_b')).rejects.toMatchObject({
      code: 'brand_not_verified',
    });
    await store.brandVerifications.review('brd_1', 'usr_a', 'approved');
    const resubmitted = await store.conceptProposals.resubmit(proposal.id, 'usr_b');
    expect(resubmitted.status).toBe('submitted');
  });
});

describe('ConceptClaimRepo.award (mirrors wear.award_concept_claim)', () => {
  it('non-creator award attempt is unauthorized (smoke d)', async () => {
    const store = makeStore();
    const { concept } = await seedConcept(store);
    const proposal = await store.conceptProposals.create('usr_b', {
      conceptId: concept.id,
      brandId: 'brd_1',
    });
    await expect(store.conceptClaims.award(proposal.id, 'usr_b')).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('awards atomically: claim, proposal statuses, stage, log, milestone royalty', async () => {
    const store = makeStore();
    const { concept } = await seedConcept(store);
    const winner = await store.conceptProposals.create('usr_b', {
      conceptId: concept.id,
      brandId: 'brd_1',
    });
    // A second verified brand pitches too — must be auto-declined.
    await store.brands.create({ ownerId: 'usr_x', slug: 'brd-2', name: 'Second Brand' });
    const brd2 = (await store.brands.getBySlug('brd-2'))!;
    await store.brandVerifications.request(brd2.id, 'usr_x');
    await store.brandVerifications.review(brd2.id, 'usr_a', 'approved');
    const loser = await store.conceptProposals.create('usr_x', {
      conceptId: concept.id,
      brandId: brd2.id,
    });

    const claim = await store.conceptClaims.award(winner.id, 'usr_c');
    expect(claim.status).toBe('active');
    expect(claim.attributionPublic).toBe(true);

    expect((await store.conceptProposals.getById(winner.id, 'usr_b'))!.status).toBe('awarded');
    expect((await store.conceptProposals.getById(loser.id, 'usr_x'))!.status).toBe('declined');
    expect((await store.concepts.getById(concept.id))!.concept.status).toBe('claimed');

    const log = await store.conceptStatusLog.listForConcept(concept.id);
    expect(log.map((e) => e.status)).toEqual(['claimed']);

    const royalties = await store.royalties.listForClaim(claim.id, 'usr_c');
    expect(royalties).toHaveLength(1);
    expect(royalties[0]).toMatchObject({
      kind: 'milestone',
      pct: 10,
      thresholdUnits: 100,
      status: 'active',
    });

    // The exclusivity wall: no second award while a claim is active.
    await expect(store.conceptClaims.award(loser.id, 'usr_c')).rejects.toMatchObject({
      code: 'concept_not_open',
    });
  });

  it('admin revoke re-opens the concept and lets a declined proposal re-enter', async () => {
    const store = makeStore();
    const { concept, claim } = await seedAwarded(store);
    await expect(store.conceptClaims.revoke(claim.id, 'usr_c')).rejects.toMatchObject({
      code: 'forbidden',
    });
    const revoked = await store.conceptClaims.revoke(claim.id, 'usr_a');
    expect(revoked.status).toBe('revoked');
    expect((await store.concepts.getById(concept.id))!.concept.status).toBe('proposed');
  });
});

describe('ConceptStatusLogRepo.advance (mirrors wear.advance_concept_status)', () => {
  it('only the active brand advances, forward-only, above claimed', async () => {
    const store = makeStore();
    const { concept } = await seedAwarded(store);

    await expect(
      store.conceptStatusLog.advance(concept.id, 'usr_c', 'in_production'),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(
      store.conceptStatusLog.advance(concept.id, 'usr_b', 'claimed'),
    ).rejects.toMatchObject({ code: 'invalid_stage' });

    await store.conceptStatusLog.advance(concept.id, 'usr_b', 'in_production', 'cutting fabric');
    // Repeat (smoke e) and backwards (smoke e2) both rejected.
    await expect(
      store.conceptStatusLog.advance(concept.id, 'usr_b', 'in_production'),
    ).rejects.toMatchObject({ code: 'stage_not_forward' });

    // Skips are allowed (straight past sample_review).
    await store.conceptStatusLog.advance(concept.id, 'usr_b', 'released');
    const log = await store.conceptStatusLog.listForConcept(concept.id);
    expect(log.map((e) => e.status)).toEqual(['claimed', 'in_production', 'released']);
  });

  it('released auto-creates the Completed Concepts post with copied artwork (smoke c4)', async () => {
    const store = makeStore();
    const { concept } = await seedAwarded(store);
    await store.conceptStatusLog.advance(concept.id, 'usr_b', 'released');

    const page = await store.posts.listByBrand('brd_1');
    expect(page.items).toHaveLength(1);
    const auto = page.items[0]!;
    expect(auto.post.conceptId).toBe(concept.id);
    expect(auto.post.authorId).toBe('usr_b');
    expect(auto.post.body).toContain('Completed Concept');
    // The body carries NO usernames — attribution is relational.
    expect(auto.post.body).not.toContain('usr_c');
    expect(auto.media).toHaveLength(1);
    expect(auto.media[0]!.url).toBe('https://cdn.test/art.png');

    // Duplicate-guarded: advancing further creates no second post.
    await store.conceptStatusLog.advance(concept.id, 'usr_b', 'sold_out');
    expect((await store.posts.listByBrand('brd_1')).items).toHaveLength(1);
  });

  it('advance with no active claim fails', async () => {
    const store = makeStore();
    const { concept, claim } = await seedAwarded(store);
    await store.conceptClaims.revoke(claim.id, 'usr_a');
    await expect(
      store.conceptStatusLog.advance(concept.id, 'usr_b', 'in_production'),
    ).rejects.toMatchObject({ code: 'no_active_claim' });
  });
});

describe('RoyaltyRepo (proof → creator confirm)', () => {
  it('brand submits proof; creator confirms close-out; admin can close any open state', async () => {
    const store = makeStore();
    const { claim } = await seedAwarded(store);
    const [ob] = await store.royalties.listForClaim(claim.id, 'usr_b');

    await expect(
      store.royalties.submitProof(ob!.id, 'usr_c', 'https://proof.test/100th'),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(store.royalties.submitProof(ob!.id, 'usr_b', '  ')).rejects.toMatchObject({
      code: 'proof_url_required',
    });

    // Creator cannot close before proof lands (confirmation protects them).
    await expect(store.royalties.close(ob!.id, 'usr_c')).rejects.toMatchObject({
      code: 'unauthorized',
    });

    const proved = await store.royalties.submitProof(
      ob!.id,
      'usr_b',
      'https://proof.test/100th',
      'Invoice for the 100th unit.',
    );
    expect(proved.status).toBe('proof_submitted');

    const closed = await store.royalties.close(ob!.id, 'usr_c');
    expect(closed.status).toBe('closed');
    expect(closed.closedBy).toBe('usr_c');
    await expect(store.royalties.close(ob!.id, 'usr_c')).rejects.toMatchObject({
      code: 'already_closed',
    });
  });

  it('admin dispute lever closes from any open state; reads are party-scoped', async () => {
    const store = makeStore();
    const { claim } = await seedAwarded(store);
    const [ob] = await store.royalties.listForClaim(claim.id, 'usr_c');
    expect(await store.royalties.listForClaim(claim.id, 'usr_x')).toHaveLength(0);
    expect(await store.royalties.listForUser('usr_b')).toHaveLength(1);

    const closed = await store.royalties.close(ob!.id, 'usr_a');
    expect(closed.status).toBe('closed');
  });
});

describe('CatalogueConversionRepo (mirrors the three conversion RPCs)', () => {
  it('propose needs released + the claiming brand; one open handshake per claim', async () => {
    const store = makeStore();
    const { concept, claim } = await seedAwarded(store);
    await expect(store.conversions.propose(claim.id, 'usr_b')).rejects.toMatchObject({
      code: 'not_released',
    });
    await store.conceptStatusLog.advance(concept.id, 'usr_b', 'released');
    await expect(store.conversions.propose(claim.id, 'usr_c')).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await store.conversions.propose(claim.id, 'usr_b');
    await expect(store.conversions.propose(claim.id, 'usr_b')).rejects.toMatchObject({
      code: 'conversion_already_open',
    });
  });

  it('accept drops the public tag, closes milestone as superseded, commits lifetime 5% (smoke c5)', async () => {
    const store = makeStore();
    const { concept, claim } = await seedAwarded(store);
    await store.conceptStatusLog.advance(concept.id, 'usr_b', 'released');
    const conv = await store.conversions.propose(claim.id, 'usr_b');

    await expect(store.conversions.respond(conv.id, 'usr_b', true)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    const accepted = await store.conversions.respond(conv.id, 'usr_c', true);
    expect(accepted.status).toBe('accepted');

    const after = (await store.conceptClaims.getById(claim.id))!;
    expect(after.attributionPublic).toBe(false);
    expect(after.status).toBe('active'); // the link persists PERMANENTLY

    const royalties = await store.royalties.listForClaim(claim.id, 'usr_c');
    const milestone = royalties.find((r) => r.kind === 'milestone')!;
    const lifetime = royalties.find((r) => r.kind === 'lifetime')!;
    expect(milestone.status).toBe('closed');
    expect(milestone.closedNote).toContain('superseded');
    expect(lifetime).toMatchObject({ pct: 5, thresholdUnits: null, status: 'active' });

    // Accepted is permanent — the handshake cannot be re-opened or re-answered.
    await expect(store.conversions.respond(conv.id, 'usr_c', false)).rejects.toMatchObject({
      code: 'conversion_not_open',
    });
    await expect(store.conversions.propose(claim.id, 'usr_b')).rejects.toMatchObject({
      code: 'conversion_already_open',
    });
  });

  it('decline and cancel leave the milestone untouched and allow a re-propose', async () => {
    const store = makeStore();
    const { concept, claim } = await seedAwarded(store);
    await store.conceptStatusLog.advance(concept.id, 'usr_b', 'released');

    const first = await store.conversions.propose(claim.id, 'usr_b');
    const declined = await store.conversions.respond(first.id, 'usr_c', false);
    expect(declined.status).toBe('declined');

    const second = await store.conversions.propose(claim.id, 'usr_b');
    const cancelled = await store.conversions.cancel(second.id, 'usr_b');
    expect(cancelled.status).toBe('cancelled');

    const royalties = await store.royalties.listForClaim(claim.id, 'usr_b');
    expect(royalties).toHaveLength(1);
    expect(royalties[0]!.status).toBe('active');
  });
});

describe('BrandVerificationRepo (owner requests, admin reviews)', () => {
  it('owner-only request; approve syncs the authoritative brand badge', async () => {
    const store = makeStore({ verified: false });
    await expect(store.brandVerifications.request('brd_1', 'usr_x')).rejects.toMatchObject({
      code: 'forbidden',
    });
    const req = await store.brandVerifications.request('brd_1', 'usr_b', 'Registered ministry.');
    expect(req.status).toBe('pending');
    expect((await store.brands.getById('brd_1'))!.verified).toBe(false);

    await expect(
      store.brandVerifications.review('brd_1', 'usr_b', 'approved'),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const approved = await store.brandVerifications.review('brd_1', 'usr_a', 'approved');
    expect(approved.status).toBe('approved');
    expect((await store.brands.getById('brd_1'))!.verified).toBe(true);

    // Revoke pulls the badge back off.
    await store.brandVerifications.review('brd_1', 'usr_a', 'revoked');
    expect((await store.brands.getById('brd_1'))!.verified).toBe(false);
  });

  it('re-request only after rejected; queue is moderator-or-own-scoped', async () => {
    const store = makeStore({ verified: false });
    await store.brandVerifications.request('brd_1', 'usr_b');
    await expect(store.brandVerifications.request('brd_1', 'usr_b')).rejects.toMatchObject({
      code: 'verification_exists',
    });

    await store.brandVerifications.review('brd_1', 'usr_a', 'rejected', 'Need business info.');
    const again = await store.brandVerifications.request('brd_1', 'usr_b', 'Docs attached.');
    expect(again.status).toBe('pending');

    expect(await store.brandVerifications.listPending('usr_m')).toHaveLength(1);
    expect(await store.brandVerifications.listPending('usr_b')).toHaveLength(1); // own
    expect(await store.brandVerifications.listPending('usr_x')).toHaveLength(0);
    expect(await store.brandVerifications.getForBrand('brd_1', 'usr_x')).toBeNull();

    // Revoked is NOT re-requestable (re-entry is an admin decision).
    await store.brandVerifications.review('brd_1', 'usr_a', 'revoked');
    await expect(store.brandVerifications.request('brd_1', 'usr_b')).rejects.toMatchObject({
      code: 'verification_exists',
    });
  });
});

describe('ReportRepo moderation (mig 145) + RoleRepo', () => {
  it('triage lifecycle is moderator-only; roles read back', async () => {
    const store = makeStore();
    expect(await store.roles.getOwn('usr_a')).toBe('admin');
    expect(await store.roles.getOwn('usr_m')).toBe('moderator');
    expect(await store.roles.getOwn('usr_c')).toBeNull();

    const report = await store.reports.create({
      reporterId: 'usr_x',
      subjectKind: 'post',
      subjectId: 'pst_000001',
      reason: 'spam',
    });
    expect(report.status).toBe('open');

    await expect(store.reports.listForModeration('usr_c')).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(store.reports.triage(report.id, 'usr_c', 'reviewed')).rejects.toMatchObject({
      code: 'forbidden',
    });

    const queue = await store.reports.listForModeration('usr_m', { status: 'open' });
    expect(queue).toHaveLength(1);

    const triaged = await store.reports.triage(report.id, 'usr_m', 'actioned');
    expect(triaged.status).toBe('actioned');
    expect(triaged.handledBy).toBe('usr_m');
    expect(triaged.handledAt).not.toBeNull();
    expect(await store.reports.listForModeration('usr_m', { status: 'open' })).toHaveLength(0);
  });
});
