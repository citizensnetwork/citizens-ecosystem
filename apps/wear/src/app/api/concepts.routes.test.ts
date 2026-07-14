import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetWearStoreForTests } from '@/lib/store';

/**
 * Route-handler tests for the mig-157 Concepts marketplace `/api/*` surface,
 * driven against the seeded in-memory store (no Supabase env). Seed cast:
 * usr_001 hannah (owns VERIFIED brd_001 salt-and-light) · usr_002 samuel
 * (owns unverified brd_002 cornerstone-co) · usr_003 ruth (platform admin).
 */
const mockSession = vi.fn();
vi.mock('@/lib/session', () => ({ getSession: () => mockSession() }));

import { GET as conceptsGET, POST as conceptsPOST } from './concepts/route';
import {
  DELETE as conceptDELETE,
  GET as conceptGET,
  PATCH as conceptPATCH,
} from './concepts/[id]/route';
import { DELETE as unvotePOST, POST as upvotePOST } from './concepts/[id]/upvote/route';
import {
  GET as proposalsGET,
  POST as proposalsPOST,
} from './concepts/[id]/proposals/route';
import { POST as statusPOST } from './concepts/[id]/status/route';
import { PATCH as proposalPATCH } from './proposals/[id]/route';
import { POST as awardPOST } from './proposals/[id]/award/route';
import { POST as revokePOST } from './claims/[id]/revoke/route';
import { POST as conversionsPOST } from './claims/[id]/conversions/route';
import { PATCH as conversionPATCH } from './conversions/[id]/route';
import { GET as royaltiesGET } from './royalties/route';
import { POST as proofPOST } from './royalties/[id]/proof/route';
import { POST as closePOST } from './royalties/[id]/close/route';
import { GET as verificationGET, POST as verificationPOST } from './brands/[slug]/verification/route';
import { GET as adminVerificationsGET } from './admin/verifications/route';
import { POST as adminReviewPOST } from './admin/verifications/[brandId]/route';
import { GET as adminReportsGET } from './admin/reports/route';
import { POST as adminTriagePOST } from './admin/reports/[id]/route';
import { POST as reportsPOST } from './reports/route';
import { GET as feedGET } from './feed/route';

const req = (url: string, init?: RequestInit): Request =>
  new Request(`http://localhost${url}`, init);
const route = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const jsonBody = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function asUser(id: string): void {
  mockSession.mockResolvedValue({
    user: { id, handle: 'seed', displayName: 'Seed', email: null, avatarUrl: null, createdAt: '' },
    session: { userId: id, issuedAt: '', expiresAt: '', scopes: [] },
  });
}
function anonymous(): void {
  mockSession.mockResolvedValue(null);
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  __resetWearStoreForTests();
  mockSession.mockReset();
});

/** Create a concept as samuel (usr_002) and return its id. */
async function createConcept(): Promise<string> {
  asUser('usr_002');
  const res = await conceptsPOST(
    req(
      '/api/concepts',
      jsonBody({
        title: 'Lion of Judah tee',
        description: 'Gold-line lion.',
        mediaUrls: ['https://cdn.test/art.png'],
      }),
    ),
    route(),
  );
  expect(res.status).toBe(201);
  return (await res.json()).id as string;
}

/** concept (samuel) → proposal (hannah's verified brand) → proposal id. */
async function createProposal(conceptId: string): Promise<string> {
  asUser('usr_001');
  const res = await proposalsPOST(
    req(
      `/api/concepts/${conceptId}/proposals`,
      jsonBody({ brandSlug: 'salt-and-light', note: 'Gold-line specialists.', estUnitPrice: 199 }),
    ),
    route({ id: conceptId }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).proposal.id as string;
}

/** Full path to an active claim: returns { conceptId, proposalId, claimId }. */
async function createClaim(): Promise<{ conceptId: string; claimId: string }> {
  const conceptId = await createConcept();
  const proposalId = await createProposal(conceptId);
  asUser('usr_002'); // the creator awards
  const res = await awardPOST(req(`/api/proposals/${proposalId}/award`, jsonBody({})), route({ id: proposalId }));
  expect(res.status).toBe(201);
  return { conceptId, claimId: (await res.json()).claim.id as string };
}

describe('concepts browse/create/detail', () => {
  it('anonymous browse works; create requires auth', async () => {
    anonymous();
    expect((await conceptsGET(req('/api/concepts'), route())).status).toBe(200);
    expect((await conceptsPOST(req('/api/concepts', jsonBody({ title: 'X' })), route())).status).toBe(401);
  });

  it('creates, details (tags + stepper log + claim), edits, and deletes', async () => {
    const conceptId = await createConcept();

    anonymous();
    const detail = await (await conceptGET(req(`/api/concepts/${conceptId}`), route({ id: conceptId }))).json();
    expect(detail.concept.title).toBe('Lion of Judah tee');
    expect(detail.concept.status).toBe('proposed');
    expect(detail.concept.media).toHaveLength(1);
    expect(detail.proposalTags).toEqual([]);
    expect(detail.statusLog).toEqual([]);
    expect(detail.claim).toBeNull();

    asUser('usr_002');
    const patched = await (
      await conceptPATCH(
        req(`/api/concepts/${conceptId}`, jsonBody({ title: 'Renamed tee' }, 'PATCH')),
        route({ id: conceptId }),
      )
    ).json();
    expect(patched.title).toBe('Renamed tee');

    // Non-creator edit → 403.
    asUser('usr_001');
    expect(
      (
        await conceptPATCH(
          req(`/api/concepts/${conceptId}`, jsonBody({ title: 'Hijack' }, 'PATCH')),
          route({ id: conceptId }),
        )
      ).status,
    ).toBe(403);

    asUser('usr_002');
    expect((await conceptDELETE(req(`/api/concepts/${conceptId}`, { method: 'DELETE' }), route({ id: conceptId }))).status).toBe(200);
    expect((await conceptGET(req(`/api/concepts/${conceptId}`), route({ id: conceptId }))).status).toBe(404);
  });

  it('upvotes toggle and count', async () => {
    const conceptId = await createConcept();
    asUser('usr_001');
    const up = await (await upvotePOST(req(`/api/concepts/${conceptId}/upvote`, { method: 'POST' }), route({ id: conceptId }))).json();
    expect(up).toEqual({ upvotes: 1, viewerUpvoted: true });
    const down = await (await unvotePOST(req(`/api/concepts/${conceptId}/upvote`, { method: 'DELETE' }), route({ id: conceptId }))).json();
    expect(down).toEqual({ upvotes: 0, viewerUpvoted: false });
  });
});

describe('proposals: verified-only, party-scoped, public tags', () => {
  it('unverified brand is denied (403), verified brand pitches, tags go public', async () => {
    const conceptId = await createConcept();

    // samuel's own unverified brand may not pitch.
    asUser('usr_002');
    const denied = await proposalsPOST(
      req(`/api/concepts/${conceptId}/proposals`, jsonBody({ brandSlug: 'cornerstone-co' })),
      route({ id: conceptId }),
    );
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe('brand_not_verified');

    await createProposal(conceptId);

    // Public tag surfaces on the detail; details stay party-scoped.
    anonymous();
    const detail = await (await conceptGET(req(`/api/concepts/${conceptId}`), route({ id: conceptId }))).json();
    expect(detail.proposalTags).toHaveLength(1);
    expect(detail.proposalTags[0].brand.slug).toBe('salt-and-light');
    expect(detail.concept.proposalCount).toBe(1);

    // usr_003 (admin/moderator) sees details; a stranger's list is empty.
    asUser('usr_003');
    const modList = await (await proposalsGET(req(`/api/concepts/${conceptId}/proposals`), route({ id: conceptId }))).json();
    expect(modList.proposals).toHaveLength(1);
    expect(modList.proposals[0].estUnitPrice).toBe(199);
  });

  it('brand edits, withdraws, and resubmits its bid', async () => {
    const conceptId = await createConcept();
    const proposalId = await createProposal(conceptId);

    asUser('usr_001');
    const edited = await (
      await proposalPATCH(req(`/api/proposals/${proposalId}`, jsonBody({ moq: 50 }, 'PATCH')), route({ id: proposalId }))
    ).json();
    expect(edited.proposal.moq).toBe(50);

    const withdrawn = await (
      await proposalPATCH(req(`/api/proposals/${proposalId}`, jsonBody({ action: 'withdraw' }, 'PATCH')), route({ id: proposalId }))
    ).json();
    expect(withdrawn.proposal.status).toBe('withdrawn');

    const resubmitted = await (
      await proposalPATCH(req(`/api/proposals/${proposalId}`, jsonBody({ action: 'resubmit' }, 'PATCH')), route({ id: proposalId }))
    ).json();
    expect(resubmitted.proposal.status).toBe('submitted');
  });
});

describe('award → advance → released auto-post → conversion (the happy path)', () => {
  it('non-creator award attempt is 401-coded unauthorized', async () => {
    const conceptId = await createConcept();
    const proposalId = await createProposal(conceptId);
    asUser('usr_001'); // brand owner, NOT the creator
    const res = await awardPOST(req(`/api/proposals/${proposalId}/award`, jsonBody({})), route({ id: proposalId }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('walks the full lifecycle with the serializer attribution rule', async () => {
    const { conceptId, claimId } = await createClaim();

    // Award side-effects: stage cached, log entry, milestone royalty.
    anonymous();
    let detail = await (await conceptGET(req(`/api/concepts/${conceptId}`), route({ id: conceptId }))).json();
    expect(detail.concept.status).toBe('claimed');
    expect(detail.concept.claimedBy.slug).toBe('salt-and-light');
    expect(detail.statusLog.map((e: { status: string }) => e.status)).toEqual(['claimed']);

    asUser('usr_001');
    const royalties = await (await royaltiesGET(req('/api/royalties'), route())).json();
    expect(royalties.royalties).toHaveLength(1);
    expect(royalties.royalties[0]).toMatchObject({ kind: 'milestone', pct: 10, thresholdUnits: 100 });

    // Backwards/repeat stages rejected; forward advance works (brand only).
    asUser('usr_002');
    expect(
      (await statusPOST(req(`/api/concepts/${conceptId}/status`, jsonBody({ status: 'in_production' })), route({ id: conceptId }))).status,
    ).toBe(401);
    asUser('usr_001');
    expect(
      (await statusPOST(req(`/api/concepts/${conceptId}/status`, jsonBody({ status: 'claimed' })), route({ id: conceptId }))).status,
    ).toBe(422);
    const advanced = await statusPOST(
      req(`/api/concepts/${conceptId}/status`, jsonBody({ status: 'in_production', note: 'cutting fabric' })),
      route({ id: conceptId }),
    );
    expect(advanced.status).toBe(201);
    expect(
      (await statusPOST(req(`/api/concepts/${conceptId}/status`, jsonBody({ status: 'in_production' })), route({ id: conceptId }))).status,
    ).toBe(409);

    // Released → auto Completed-Concepts post with the PUBLIC creator tag.
    await statusPOST(req(`/api/concepts/${conceptId}/status`, jsonBody({ status: 'released' })), route({ id: conceptId }));
    const feed = await (await feedGET(req('/api/feed'), route())).json();
    const auto = feed.items.find((p: { concept?: { id: string } | null }) => p.concept?.id === conceptId);
    expect(auto).toBeDefined();
    expect(auto.brand.slug).toBe('salt-and-light');
    expect(auto.brand.verified).toBe(true); // badge is authoritative from wear.brands.verified
    expect(auto.concept.creator.handle).toBe('samuel'); // attribution_public=true

    // Conversion handshake: brand proposes, creator accepts.
    const conv = await (await conversionsPOST(req(`/api/claims/${claimId}/conversions`, jsonBody({})), route({ id: claimId }))).json();
    asUser('usr_002');
    const accepted = await (
      await conversionPATCH(req(`/api/conversions/${conv.conversion.id}`, jsonBody({ action: 'accept' }, 'PATCH')), route({ id: conv.conversion.id }))
    ).json();
    expect(accepted.conversion.status).toBe('accepted');

    // The tag is dropped but the concept link persists (permanent).
    const feedAfter = await (await feedGET(req('/api/feed'), route())).json();
    const autoAfter = feedAfter.items.find((p: { concept?: { id: string } | null }) => p.concept?.id === conceptId);
    expect(autoAfter.concept.creator).toBeNull();
    expect(autoAfter.concept.id).toBe(conceptId);

    // Royalties flipped: milestone closed (superseded), lifetime 5% active.
    asUser('usr_001');
    const after = await (await royaltiesGET(req('/api/royalties'), route())).json();
    const milestone = after.royalties.find((r: { kind: string }) => r.kind === 'milestone');
    const lifetime = after.royalties.find((r: { kind: string }) => r.kind === 'lifetime');
    expect(milestone.status).toBe('closed');
    expect(lifetime).toMatchObject({ pct: 5, status: 'active' });
  });

  it('royalty proof → creator close-out over the API', async () => {
    const { conceptId, claimId } = await createClaim();
    asUser('usr_001');
    await statusPOST(req(`/api/concepts/${conceptId}/status`, jsonBody({ status: 'released' })), route({ id: conceptId }));
    const list = await (await royaltiesGET(req('/api/royalties'), route())).json();
    const obId = list.royalties[0].id as string;

    expect(
      (await proofPOST(req(`/api/royalties/${obId}/proof`, jsonBody({ proofUrl: 'not-a-url' })), route({ id: obId }))).status,
    ).toBe(422);
    const proved = await proofPOST(
      req(`/api/royalties/${obId}/proof`, jsonBody({ proofUrl: 'https://proof.test/100th', note: 'Invoice #100' })),
      route({ id: obId }),
    );
    expect((await proved.json()).royalty.status).toBe('proof_submitted');

    asUser('usr_002'); // creator confirms
    const closed = await closePOST(req(`/api/royalties/${obId}/close`, jsonBody({})), route({ id: obId }));
    expect((await closed.json()).royalty.status).toBe('closed');
  });

  it('admin revoke re-opens the concept', async () => {
    const { conceptId, claimId } = await createClaim();
    asUser('usr_001');
    expect((await revokePOST(req(`/api/claims/${claimId}/revoke`, jsonBody({})), route({ id: claimId }))).status).toBe(403);
    asUser('usr_003');
    const revoked = await (await revokePOST(req(`/api/claims/${claimId}/revoke`, jsonBody({})), route({ id: claimId }))).json();
    expect(revoked.claim.status).toBe('revoked');
    anonymous();
    const detail = await (await conceptGET(req(`/api/concepts/${conceptId}`), route({ id: conceptId }))).json();
    expect(detail.concept.status).toBe('proposed');
  });
});

describe('brand verification request + admin review', () => {
  it('owner requests; admin approves; the badge flips on the brand', async () => {
    asUser('usr_002');
    const created = await verificationPOST(
      req('/api/brands/cornerstone-co/verification', jsonBody({ note: 'Registered business.' })),
      route({ slug: 'cornerstone-co' }),
    );
    expect(created.status).toBe(201);

    // Queue is role-gated.
    asUser('usr_001');
    expect((await adminVerificationsGET(req('/api/admin/verifications'), route())).status).toBe(403);
    asUser('usr_003');
    const queue = await (await adminVerificationsGET(req('/api/admin/verifications'), route())).json();
    expect(queue.verifications).toHaveLength(1);
    expect(queue.verifications[0].brand.slug).toBe('cornerstone-co');
    const brandId = queue.verifications[0].brandId as string;

    const reviewed = await adminReviewPOST(
      req(`/api/admin/verifications/${brandId}`, jsonBody({ decision: 'approved', reviewNote: 'Docs check out.' })),
      route({ brandId }),
    );
    expect((await reviewed.json()).verification.status).toBe('approved');

    asUser('usr_002');
    const mine = await (await verificationGET(req('/api/brands/cornerstone-co/verification'), route({ slug: 'cornerstone-co' }))).json();
    expect(mine.verified).toBe(true);
    expect(mine.verification.status).toBe('approved');
  });
});

describe('admin reports triage queue (mig 145)', () => {
  it('report → open queue → triage; plain users are shut out', async () => {
    asUser('usr_001');
    const report = await (
      await reportsPOST(
        req('/api/reports', jsonBody({ subjectKind: 'post', subjectId: 'pst_seed_002', reason: 'spam' })),
        route(),
      )
    ).json();
    expect(report.status ?? 'open').toBe('open');

    expect((await adminReportsGET(req('/api/admin/reports'), route())).status).toBe(403);

    asUser('usr_003');
    const queue = await (await adminReportsGET(req('/api/admin/reports'), route())).json();
    expect(queue.reports).toHaveLength(1);
    const id = queue.reports[0].id as string;

    const triaged = await (
      await adminTriagePOST(req(`/api/admin/reports/${id}`, jsonBody({ status: 'dismissed' })), route({ id }))
    ).json();
    expect(triaged.report.status).toBe('dismissed');
    expect(triaged.report.handledBy).toBe('usr_003');

    const openAfter = await (await adminReportsGET(req('/api/admin/reports?status=open'), route())).json();
    expect(openAfter.reports).toHaveLength(0);
  });
});
