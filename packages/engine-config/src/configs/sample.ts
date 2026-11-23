/**
 * A made-up sample tenant, for tests and as a worked example.
 *
 * "Quillfern Commons" does not exist. It is a neighbourhood world of repair workshops, shared
 * gardens and street suppers, chosen because it looks like neither Citizens nor any real
 * tenant. A real tenant's configuration is never committed to this repository.
 *
 * It is deliberately unlike the Citizens configuration, so the tests cover both ends: lower-case
 * terms, a flat map, no card groups, no slogan, a required legal operator, and entitlements
 * that allow less than the engine offers.
 */

import type { Configuration, Entitlements } from '../schema';
import { CONTRACT_VERSION } from '../version';

/** What the engine owner allows the sample tenant. */
export const sampleEntitlements: Entitlements = {
  contract: CONTRACT_VERSION,
  schemaLine: 'engine',
  features: {
    // Partners are invited by staff. Open partner sign-up is not allowed.
    partnerInvitations: true,
    partnerApplications: false,
    gatherings: true,
    liveLocation: true,
    // Allowed, but the tenant has not switched it on.
    communityIdeas: true,
  },
  limits: { mapTiltMaxDegrees: 30, maxCategoriesPerList: 12 },
  requirements: { legalOperator: true },
};

export const sampleConfiguration: Configuration = {
  contract: CONTRACT_VERSION,
  revision: 3,

  app: {
    themeColor: '#0f766e',
    backgroundColor: '#f4f7f5',
    display: 'standalone',
    orientation: 'any',
    storeCategories: ['lifestyle'],
    icons: [
      { src: 'icons/sample-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/sample-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    faviconSrc: 'icons/sample.svg',
    logoSrc: 'assets/sample-mark.svg',
  },

  // The only place a tenant's world names the engine owner.
  legal: { serviceProvider: '219' },

  vocabulary: {
    terms: {
      world: { one: 'Quillfern Commons' },
      worldShort: { one: 'Quillfern' },
      discovery: { one: 'the Directory', oneCapitalised: 'The Directory' },
      gatherings: { one: 'Get-togethers' },
      user: { one: 'neighbour', many: 'neighbours' },
      partner: { one: 'host', many: 'hosts' },
    },
    addresses: {
      partner: 'host',
      partners: 'hosts',
      users: 'neighbours',
      partnerApplications: 'host-requests',
    },
    messages: {
      'screen.wordmark.secondary': 'Commons',
      'manifest.description': 'Find makers, gardens and get-togethers near you.',
    },
  },

  theme: {
    light: {
      surface0: '#f4f7f5',
      surface1: '#ffffff',
      surface2: '#e9efec',
      text1: '#14201c',
      text2: '#4a5a54',
      accent: '#0f766e',
      accentContrast: '#ffffff',
      accentInk: '#0f766e',
      accentLight: '#5eead4',
      accentDeep: '#115e59',
      ok: '#166534',
      closed: '#9f1239',
      error: '#b91c1c',
      live: '#dc2626',
      focusRing: '#0f766e',
      divider: 'rgba(20, 32, 28, 0.12)',
      scrim: 'rgba(20, 32, 28, 0.45)',
      mapBackground: '#dfe8e3',
    },
    dark: {
      surface0: '#0f1513',
      surface1: '#18211e',
      surface2: '#22302b',
      text1: '#eef4f1',
      text2: '#a9bab3',
      accent: '#2dd4bf',
      accentContrast: '#06201c',
      accentInk: '#5eead4',
      accentLight: '#99f6e4',
      accentDeep: '#14b8a6',
      ok: '#6ee7a8',
      closed: '#fda4af',
      error: '#fca5a5',
      live: '#f87171',
      focusRing: '#5eead4',
      divider: 'rgba(238, 244, 241, 0.14)',
      scrim: 'rgba(0, 0, 0, 0.6)',
      mapBackground: '#1c2623',
    },
    fonts: {
      display: "'Fraunces', serif",
      body: "'Inter', system-ui, sans-serif",
    },
  },

  categories: {
    mapGroups: [
      { id: 'make', label: 'Makers & repair', color: { light: '#8a4b2a', dark: '#e3a988' } },
      { id: 'grow', label: 'Gardens & food', color: { light: '#3d6b2f', dark: '#a3cf8f' } },
      { id: 'meet', label: 'Meet-ups', color: { light: '#4a5a9a', dark: '#a9b6ea' } },
    ],
    cardGroups: [],
    events: [
      {
        id: 'repair-cafes',
        label: 'Repair cafés',
        short: 'Repair',
        color: '#8a4b2a',
        icon: 'Wrench',
        mapGroup: 'make',
        keywords: ['repair', 'fix', 'mend'],
      },
      {
        id: 'workshops',
        label: 'Workshops',
        short: 'Workshops',
        color: '#b45309',
        icon: 'Hammer',
        mapGroup: 'make',
      },
      {
        id: 'harvest-swaps',
        label: 'Harvest swaps',
        short: 'Swaps',
        color: '#3d6b2f',
        icon: 'Sprout',
        mapGroup: 'grow',
      },
      {
        id: 'street-suppers',
        label: 'Street suppers',
        short: 'Suppers',
        color: '#4a5a9a',
        icon: 'Utensils',
        mapGroup: 'meet',
      },
    ],
    places: [
      {
        id: 'tool-libraries',
        label: 'Tool libraries',
        short: 'Tools',
        description: 'Borrow a tool instead of buying one',
        color: '#92400e',
        icon: 'Wrench',
        mapGroup: 'make',
      },
      {
        id: 'shared-gardens',
        label: 'Shared gardens',
        short: 'Gardens',
        color: '#166534',
        icon: 'Sprout',
        mapGroup: 'grow',
      },
    ],
    partnerTypes: [
      {
        id: 'workshop-host',
        label: 'Workshop',
        short: 'Workshop',
        color: '#8a4b2a',
        icon: 'Hammer',
        mapGroup: 'make',
        extraReview: false,
      },
      {
        id: 'garden-host',
        label: 'Garden',
        short: 'Garden',
        color: '#3d6b2f',
        icon: 'Sprout',
        mapGroup: 'grow',
        extraReview: false,
      },
      {
        id: 'kitchen-host',
        label: 'Community kitchen',
        short: 'Kitchen',
        color: '#b45309',
        icon: 'Utensils',
        mapGroup: 'meet',
        extraReview: true,
      },
    ],
    partnerKinds: [
      { id: 'group', label: 'Group' },
      { id: 'business', label: 'Business' },
      { id: 'person', label: 'Person' },
    ],
    defaultPartnerKind: 'group',
    gatheringStarters: [
      { id: 'fix-it', label: 'Fix-it hour', category: 'repair-cafes', icon: 'Wrench' },
      { id: 'weeding', label: 'Weeding party', category: 'harvest-swaps', icon: 'Sprout' },
    ],
  },

  features: {
    partnerInvitations: true,
    gatherings: true,
  },

  layout: {
    components: ['explorePanel', 'messages', 'notifications', 'gatherings', 'listingClaim'],
    navigation: ['map', 'discover', 'gatherings', 'messages'],
    controls: [
      'mapSearch',
      'mapCategoryPills',
      'mapZoomButtons',
      'mapLocateButton',
      'shareQrCode',
      'themeSwitch',
    ],
  },

  map: {
    // A flat map: the fewest tile requests a visit.
    tiltDegrees: 0,
    defaultCenter: { lat: -29, lng: 24 },
  },
};
