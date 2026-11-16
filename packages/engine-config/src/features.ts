/**
 * The feature switches of the engine.
 *
 * Every switch is OFF unless a world's configuration switches it on, and a configuration can
 * only switch on what the world's entitlements allow. A feature that is always part of a world
 * (the map, profiles, events, follow and save, messaging) is not a switch and is not listed.
 *
 * `line` says which database line carries what the feature needs (ADR-001, decision 5):
 * - 'engine': the tables and functions are in the engine baseline, so any tenant can be allowed it.
 * - 'citizens': it depends on things that exist only in the Citizens database line. The engine
 *   owner cannot allow it to a tenant on the engine baseline until it is rebuilt for the baseline.
 *
 * There is no payment feature, and none may be added here: the engine takes no payments
 * (founder, 2026-11-11). A tenant bills its partners itself.
 */

export type SchemaLine = 'engine' | 'citizens';

export interface FeatureDefinition {
  readonly summary: string;
  readonly line: SchemaLine;
}

export const FEATURES = {
  partnerInvitations: {
    summary:
      'Staff create a partner listing and invite its owner by email to take it over and manage it.',
    line: 'engine',
  },
  partnerApplications: {
    summary: 'Anyone may apply to become a partner; staff approve or decline each application.',
    line: 'engine',
  },
  communityEvents: {
    summary: 'A user who is not a partner may post one community-organised event a week.',
    line: 'engine',
  },
  communityIdeas: {
    summary:
      'The ideas board: people suggest a community need, others vote, and an idea that reaches its goal becomes a project.',
    line: 'engine',
  },
  gatherings: {
    summary: 'Small gatherings any user can start from a short list of starters.',
    line: 'engine',
  },
  liveLocation: {
    summary: 'A user may share a live location for a short time; it is cleaned up automatically.',
    line: 'engine',
  },
  partnerLevels: {
    summary: 'A level badge on a partner profile, worked out from public activity.',
    line: 'engine',
  },
  googleSignIn: {
    summary:
      'Sign-in with Google beside the email code. Needs a Google sign-in client in the tenant’s own Google account.',
    line: 'engine',
  },
  publicApi: {
    summary:
      'The public read-only data feed. Its field names are fixed by a stability policy and carry Citizens wording, so a tenant gets no feed until a neutral version exists (founder, 2026-11-11).',
    line: 'citizens',
  },
  aiSearch: {
    summary: 'Search that answers a typed question.',
    line: 'citizens',
  },
  listingAutomation: {
    summary: 'The listing helper that reads a partner’s public website and suggests updates.',
    line: 'citizens',
  },
  formIntake: {
    summary: 'Partner listings created from an outside sign-up form.',
    line: 'citizens',
  },
  personalisationGames: {
    summary:
      'Short games that tune what a user is shown. The question pool is not tenant data yet.',
    line: 'citizens',
  },
} as const satisfies Record<string, FeatureDefinition>;

export type FeatureKey = keyof typeof FEATURES;

export const FEATURE_KEYS = Object.keys(FEATURES) as readonly FeatureKey[];

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === 'string' && Object.hasOwn(FEATURES, value);
}

/** Can the engine owner allow this feature to a world on the given database line? */
export function featureAvailableOn(feature: FeatureKey, line: SchemaLine): boolean {
  return FEATURES[feature].line === 'engine' || line === 'citizens';
}
