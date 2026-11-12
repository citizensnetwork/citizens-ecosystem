/**
 * The component and control registry: the parts of a world a tenant can arrange.
 *
 * A COMPONENT is a screen or a block of a screen. A CONTROL is a single button or bar.
 * - `core` parts are always present; a configuration cannot remove them.
 * - a part with a `feature` exists only while that feature is on for the world.
 * - a `navigable` component may be placed in the main navigation.
 *
 * A configuration lists the optional parts it shows (`layout.components`, `layout.controls`)
 * and the order of its navigation (`layout.navigation`). The registry is the engine's side of
 * that agreement: it is the full list a configuration may choose from.
 */

import type { FeatureKey } from './features';

export interface ComponentDefinition {
  readonly summary: string;
  readonly core?: true;
  readonly navigable?: true;
  readonly feature?: FeatureKey;
}

export interface ControlDefinition {
  readonly summary: string;
  readonly feature?: FeatureKey;
}

export const COMPONENTS = {
  map: { summary: 'The map: the home screen of a world.', core: true, navigable: true },
  discover: { summary: 'The list of every listing, with search.', core: true, navigable: true },
  settings: { summary: 'A user’s own settings.', core: true },
  partnerPortal: { summary: 'Where a partner manages its profile, events and news.', core: true },
  admin: { summary: 'The staff screens.', core: true },
  explorePanel: { summary: 'The panel of nearby listings under the map.' },
  messages: { summary: 'Private messages.', navigable: true },
  notifications: { summary: 'The list of a user’s notifications.', navigable: true },
  signInSlogan: { summary: 'The rotating slogan on the sign-in screen.' },
  gatherings: { summary: 'The gatherings screen.', navigable: true, feature: 'gatherings' },
  ideasBoard: { summary: 'The ideas board.', navigable: true, feature: 'communityIdeas' },
  partnerApplication: {
    summary: 'The form a person fills in to apply to become a partner.',
    feature: 'partnerApplications',
  },
  listingClaim: {
    summary: 'The prompt that offers an invited owner the listing staff created.',
    feature: 'partnerInvitations',
  },
  partnerLevelBadge: {
    summary: 'The level badge on a partner profile.',
    feature: 'partnerLevels',
  },
} as const satisfies Record<string, ComponentDefinition>;

export const CONTROLS = {
  mapSearch: { summary: 'The search bar over the map.' },
  mapCategoryPills: { summary: 'The row of category group pills over the map.' },
  mapZoomButtons: { summary: 'The map’s zoom buttons.' },
  mapLocateButton: { summary: 'The map’s "where am I" button.' },
  quickAccess: { summary: 'The quick-access tools under the map’s menu button.' },
  shareQrCode: { summary: 'The QR code on a listing’s share sheet.' },
  themeSwitch: { summary: 'The light and dark switch in settings.' },
  liveLocationSwitch: {
    summary: 'The switch that shares a live location.',
    feature: 'liveLocation',
  },
  googleSignInButton: {
    summary: 'The Google button on the sign-in screen.',
    feature: 'googleSignIn',
  },
} as const satisfies Record<string, ControlDefinition>;

export type ComponentKey = keyof typeof COMPONENTS;
export type ControlKey = keyof typeof CONTROLS;

export const COMPONENT_KEYS = Object.keys(COMPONENTS) as readonly ComponentKey[];
export const CONTROL_KEYS = Object.keys(CONTROLS) as readonly ControlKey[];

export function componentDefinition(key: ComponentKey): ComponentDefinition {
  return COMPONENTS[key];
}

export function controlDefinition(key: ControlKey): ControlDefinition {
  return CONTROLS[key];
}
