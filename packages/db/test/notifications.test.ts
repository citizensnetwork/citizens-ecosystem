import { describe, expect, it } from 'vitest';
import { MemoryWearStore } from '../src/index';
import type { WearBrand, WearUser } from '../src/index';

/**
 * Contract tests for the mig-159 notifications backend. Each case mirrors a
 * SECDEF lifecycle trigger from `159_wear_notifications.sql`: the recipient is
 * the party who cares, self-notifications are dropped, and the read/unread
 * semantics match the recipient-scoped RLS. MemoryWearStore emits these from its
 * lifecycle methods, so this doubles as the `SupabaseWearStore` spec.
 */

const T0 = '2026-07-15T00:00:00.000Z';

const user = (id: string): WearUser => ({
  id,
  handle: id,
  displayName: id,
  avatarUrl: null,
  createdAt: T0,
  updatedAt: T0,
});

const brand = (id: string, ownerUserId: string, verified = true): WearBrand => ({
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

/** creator usr_c · brand owner usr_b (brd_1, verified) · admin usr_a. */
function makeStore() {
  let tick = 0;
  return new MemoryWearStore({
    now: () => new Date(Date.parse(T0) + tick++ * 1000),
    seedUsers: [user('usr_c'), user('usr_b'), user('usr_a')],
    seedBrands: [brand('brd_1', 'usr_b')],
    seedRoles: [{ userId: 'usr_a', role: 'admin' }],
  });
}

async function seedProposal(store: MemoryWearStore) {
  const { concept } = await store.concepts.create({ creatorId: 'usr_c', title: 'Lion tee' });
  const proposal = await store.conceptProposals.create('usr_b', {
    conceptId: concept.id,
    brandId: 'brd_1',
  });
  return { concept, proposal };
}

async function seedAwarded(store: MemoryWearStore) {
  const { concept, proposal } = await seedProposal(store);
  const claim = await store.conceptClaims.award(proposal.id, 'usr_c');
  return { concept, proposal, claim };
}

describe('NotificationRepo — proposal', () => {
  it('notifies the concept creator, not the proposing brand owner', async () => {
    const store = makeStore();
    const { concept } = await seedProposal(store);

    const creator = await store.notifications.list('usr_c');
    expect(creator.items).toHaveLength(1);
    expect(creator.items[0]).toMatchObject({
      type: 'concept_proposal',
      actorId: 'usr_b',
      conceptId: concept.id,
      brandId: 'brd_1',
      readAt: null,
    });
    expect(creator.items[0]!.data).toMatchObject({ conceptTitle: 'Lion tee', brandName: 'brd_1' });

    const owner = await store.notifications.list('usr_b');
    expect(owner.items).toHaveLength(0);
  });
});

describe('NotificationRepo — award', () => {
  it('notifies the winning brand owner and does not self-notify the creator', async () => {
    const store = makeStore();
    const { concept } = await seedAwarded(store);

    const owner = await store.notifications.list('usr_b');
    const awarded = owner.items.filter((n) => n.type === 'concept_awarded');
    expect(awarded).toHaveLength(1);
    expect(awarded[0]).toMatchObject({ actorId: 'usr_c', conceptId: concept.id, brandId: 'brd_1' });

    // The 'claimed' status-log row is authored by the creator → no self-notify.
    const creator = await store.notifications.list('usr_c');
    expect(creator.items.some((n) => n.type === 'concept_advanced')).toBe(false);
  });
});

describe('NotificationRepo — status advance', () => {
  it('notifies the creator with the new stage', async () => {
    const store = makeStore();
    const { concept } = await seedAwarded(store);
    await store.conceptStatusLog.advance(concept.id, 'usr_b', 'in_production', 'cutting fabric');

    const creator = await store.notifications.list('usr_c');
    const advanced = creator.items.filter((n) => n.type === 'concept_advanced');
    expect(advanced).toHaveLength(1);
    expect(advanced[0]).toMatchObject({ actorId: 'usr_b', conceptId: concept.id });
    expect(advanced[0]!.data).toMatchObject({ stage: 'in_production', note: 'cutting fabric' });
  });
});

describe('NotificationRepo — royalty', () => {
  it('proof submit notifies the creator; close notifies the brand owner', async () => {
    const store = makeStore();
    const { claim } = await seedAwarded(store);
    const [ob] = await store.royalties.listForClaim(claim.id, 'usr_b');

    await store.royalties.submitProof(ob!.id, 'usr_b', 'https://proof.test/100th');
    const creator = await store.notifications.list('usr_c');
    expect(creator.items.some((n) => n.type === 'royalty_proof' && n.actorId === 'usr_b')).toBe(true);

    await store.royalties.close(ob!.id, 'usr_c');
    const owner = await store.notifications.list('usr_b');
    expect(owner.items.some((n) => n.type === 'royalty_closed' && n.actorId === 'usr_c')).toBe(true);
  });
});

describe('NotificationRepo — catalogue conversion', () => {
  it('propose notifies the creator; response notifies the brand owner', async () => {
    const store = makeStore();
    const { concept, claim } = await seedAwarded(store);
    await store.conceptStatusLog.advance(concept.id, 'usr_b', 'released');

    await store.conversions.propose(claim.id, 'usr_b');
    const creator = await store.notifications.list('usr_c');
    expect(creator.items.some((n) => n.type === 'conversion_proposed')).toBe(true);

    const [conv] = await store.conversions.listForClaim(claim.id, 'usr_c');
    await store.conversions.respond(conv!.id, 'usr_c', true);
    const owner = await store.notifications.list('usr_b');
    const responded = owner.items.filter((n) => n.type === 'conversion_responded');
    expect(responded).toHaveLength(1);
    expect(responded[0]!.data).toMatchObject({ accepted: true });
  });
});

describe('NotificationRepo — read semantics', () => {
  it('counts unread, marks specific + all read, and is recipient-scoped', async () => {
    const store = makeStore();
    // Two proposals from the same brand on two concepts → two creator notifications.
    await seedProposal(store);
    await seedProposal(store);

    expect(await store.notifications.unreadCount('usr_c')).toBe(2);
    expect(await store.notifications.unreadCount('usr_b')).toBe(0);

    const page = await store.notifications.list('usr_c');
    const first = page.items[0]!.id;

    // A different user cannot mark someone else's notification read.
    expect(await store.notifications.markRead('usr_b', [first])).toBe(0);
    expect(await store.notifications.unreadCount('usr_c')).toBe(2);

    // Owner marks one read.
    expect(await store.notifications.markRead('usr_c', [first])).toBe(1);
    expect(await store.notifications.unreadCount('usr_c')).toBe(1);
    // Marking the same one again is a no-op.
    expect(await store.notifications.markRead('usr_c', [first])).toBe(0);

    // Mark all clears the rest.
    expect(await store.notifications.markAllRead('usr_c')).toBe(1);
    expect(await store.notifications.unreadCount('usr_c')).toBe(0);
  });

  it('paginates newest-first', async () => {
    const store = makeStore();
    await seedProposal(store);
    await seedProposal(store);
    const page = await store.notifications.list('usr_c', { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe('1');
  });
});
