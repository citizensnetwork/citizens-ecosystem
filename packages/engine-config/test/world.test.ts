import { describe, expect, it } from 'vitest';
import {
  citizensConfiguration,
  citizensEntitlements,
  COMPONENT_KEYS,
  COMPONENTS,
  CONTROL_KEYS,
  CONTROLS,
  createWorld,
  FEATURE_KEYS,
  featureAvailableOn,
  FEATURES,
  isFeatureKey,
  sampleConfiguration,
  sampleEntitlements,
  type ComponentDefinition,
  type ControlDefinition,
} from '../src/index';
import { clone } from './helpers';

const sample = createWorld(sampleConfiguration, sampleEntitlements);
const citizens = createWorld(citizensConfiguration, citizensEntitlements);

describe('a world’s words', () => {
  it('a tenant that only sets its terms gets a complete world in its own words', () => {
    expect(sample.t('screen.apply.title')).toBe('Become a host');
    expect(sample.t('screen.portal.title')).toBe('Host Portal');
    expect(sample.t('screen.fallback.userName')).toBe('A neighbour');
    expect(sample.t('screen.admin.tab.users')).toBe('Neighbours');
    expect(sample.t('screen.listing.whereMapAndDirectory')).toBe('on the map and in the Directory');
    expect(sample.t('screen.gatherings.title')).toBe('Get-togethers');
    expect(sample.t('screen.loading')).toBe('Loading Quillfern Commons');
    expect(sample.t('email.signOff')).toBe('The Quillfern Commons team');
    expect(sample.t('notification.nearbyRsvp')).toBe('A few neighbours near you just RSVPed.');
  });

  it('a message the tenant worded itself replaces the default', () => {
    expect(sample.t('screen.wordmark.secondary')).toBe('Commons');
    expect(sample.t('manifest.description')).toBe(
      'Find makers, gardens and get-togethers near you.',
    );
    expect(citizens.t('screen.discover.title')).toBe('Kingdom Exploration');
  });

  it('fills values, the same way on every call', () => {
    expect(sample.t('email.listingInvite.subject', { name: 'Fern Shed' })).toBe(
      'Is Fern Shed your organisation?',
    );
    expect(sample.t('email.listingInvite.subject', { name: 'Tool Loft' })).toBe(
      'Is Tool Loft your organisation?',
    );
    expect(() => sample.t('email.listingInvite.subject')).toThrow(/\{\$name\}/);
  });

  it('gives terms and address words directly', () => {
    expect(sample.term('partner')).toBe('host');
    expect(sample.term('partner', 'Many')).toBe('Hosts');
    expect(sample.term('discovery', 'One')).toBe('The Directory');
    expect(sample.term('ideaProject', 'many')).toBe('community projects');
    expect(sample.address('partners')).toBe('hosts');
    expect(sample.address('partnerApplications')).toBe('host-requests');
    expect(citizens.address('users')).toBe('citizens');
  });

  it('shows nothing of Citizens in the sample tenant’s words', () => {
    const everything = [
      ...Object.values(sample.wording('app')),
      ...Object.values(sample.wording('server')),
      ...Object.values(sample.wording('edge')),
      ...Object.values(sample.wording('database')),
      ...Object.values(sample.addresses),
      JSON.stringify(sample.manifest()),
    ].join('\n');
    expect(everything).not.toMatch(/citizen|kingdom|contributor|ministr|church|faith/i);
  });
});

describe('a world’s features', () => {
  it('a feature is on only when the tenant switched it on', () => {
    expect([...sample.features].sort()).toEqual(['gatherings', 'partnerInvitations']);
    expect(sample.hasFeature('partnerInvitations')).toBe(true);
    // allowed by the entitlements, but not switched on
    expect(sample.hasFeature('communityIdeas')).toBe(false);
    expect(sample.hasFeature('liveLocation')).toBe(false);
  });

  it('the pilot switches: partner invitations on, open partner sign-up off', () => {
    expect(sample.hasFeature('partnerInvitations')).toBe(true);
    expect(sample.hasFeature('partnerApplications')).toBe(false);
    expect(sample.shows('listingClaim')).toBe(true);
    expect(sample.shows('partnerApplication')).toBe(false);
  });

  it('drops a feature the entitlements do not allow, even in a document nobody checked', () => {
    const forged = clone(sampleConfiguration);
    forged.features.partnerApplications = true;
    forged.features.publicApi = true;
    const world = createWorld(forged, sampleEntitlements);
    expect(world.hasFeature('partnerApplications')).toBe(false);
    expect(world.hasFeature('publicApi')).toBe(false);
  });

  it('drops a Citizens-line feature on the engine line, even if the entitlements were forged too', () => {
    const forgedConfiguration = clone(sampleConfiguration);
    forgedConfiguration.features.publicApi = true;
    const forgedEntitlements = clone(sampleEntitlements);
    forgedEntitlements.features.publicApi = true;
    expect(createWorld(forgedConfiguration, forgedEntitlements).hasFeature('publicApi')).toBe(
      false,
    );
  });

  it('Citizens keeps what it has today, with the three environment switches at their default', () => {
    for (const on of [
      'partnerInvitations',
      'partnerApplications',
      'communityEvents',
      'communityIdeas',
      'gatherings',
      'partnerLevels',
      'googleSignIn',
      'publicApi',
      'listingAutomation',
      'formIntake',
    ] as const) {
      expect(citizens.hasFeature(on), on).toBe(true);
    }
    for (const off of ['liveLocation', 'personalisationGames', 'aiSearch'] as const) {
      expect(citizens.hasFeature(off), off).toBe(false);
    }
  });
});

describe('a world’s layout', () => {
  it('core components are always there; optional ones only when listed and their feature is on', () => {
    for (const core of ['map', 'discover', 'settings', 'partnerPortal', 'admin'] as const) {
      expect(sample.shows(core), core).toBe(true);
    }
    expect(sample.shows('gatherings')).toBe(true);
    expect(sample.shows('messages')).toBe(true);
    expect(sample.shows('signInSlogan')).toBe(false);
    expect(sample.shows('ideasBoard')).toBe(false);
    expect(citizens.shows('ideasBoard')).toBe(true);
  });

  it('a listed component disappears with its feature', () => {
    const configuration = clone(sampleConfiguration);
    configuration.features.gatherings = false;
    const world = createWorld(configuration, sampleEntitlements);
    expect(world.shows('gatherings')).toBe(false);
    expect(world.navigation).toEqual(['map', 'discover', 'messages']);
  });

  it('gives the navigation in the tenant’s order', () => {
    expect(sample.navigation).toEqual(['map', 'discover', 'gatherings', 'messages']);
    expect(citizens.navigation).toEqual([
      'map',
      'discover',
      'gatherings',
      'messages',
      'notifications',
    ]);
  });

  it('a control is there when listed and its feature is on', () => {
    expect(sample.hasControl('mapSearch')).toBe(true);
    expect(sample.hasControl('quickAccess')).toBe(false);
    expect(sample.hasControl('googleSignInButton')).toBe(false);
    expect(citizens.hasControl('googleSignInButton')).toBe(true);
    const configuration = clone(sampleConfiguration);
    configuration.layout.controls.push('liveLocationSwitch');
    expect(createWorld(configuration, sampleEntitlements).hasControl('liveLocationSwitch')).toBe(
      false,
    );
  });
});

describe('a world’s categories, theme and home-screen app', () => {
  it('names an event card by its group and category, when the category has a card group', () => {
    expect(citizens.eventHeading('care-recovery')).toBe('Serve | Care & Recovery');
    expect(citizens.eventHeading('members-only')).toBe('Access | Members Only');
    expect(citizens.eventHeading('no-such-category')).toBeUndefined();
    expect(sample.eventHeading('repair-cafes')).toBeUndefined();
  });

  it('gives the theme as CSS variables', () => {
    expect(sample.cssVariables('dark')['--surface-1']).toBe('#18211e');
    expect(citizens.cssVariables('light')['--gold']).toBe('#f2bd22');
  });

  it('builds the home-screen app file from the app details and the vocabulary', () => {
    expect(sample.manifest()).toEqual({
      name: 'Quillfern Commons',
      short_name: 'Quillfern',
      description: 'Find makers, gardens and get-togethers near you.',
      start_url: '/',
      display: 'standalone',
      background_color: '#f4f7f5',
      theme_color: '#0f766e',
      orientation: 'any',
      categories: ['lifestyle'],
      icons: [
        { src: '/icons/sample-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/sample-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
  });

  it('the app file is a copy: changing it does not change the configuration', () => {
    const manifest = sample.manifest();
    (manifest.categories as string[]).push('changed');
    expect(sampleConfiguration.app.storeCategories).toEqual(['lifestyle']);
  });
});

describe('wording for code that cannot import this package', () => {
  it('gives the database its notification text, in the world’s words, with values left in place', () => {
    expect(citizens.wording('database')).toEqual({
      'notification.partnerApproved.title': "You're live on Citizens Connect!",
      'notification.partnerApproved.body':
        'Your Contributor listing was approved. It is now on the map and in Kingdom Discovery.',
      'notification.partnerDeclined.title': 'About your Contributor application',
      'notification.followedPartner.fallbackName': 'a Contributor you follow',
      'notification.ideaGoalReached.title': 'Kingdom Project: goal reached!',
      'notification.ideaLead.body':
        'You are the project lead for "{$title}". Schedule the kickoff from the Kingdom Projects board.',
      'notification.ideaScheduled.title': 'Kingdom Project scheduled',
    });
  });

  it('leaves out the text of a feature that is off', () => {
    expect(sample.wording('database')).toEqual({
      'notification.followedPartner.fallbackName': 'a host you follow',
    });
    expect(sample.wording('edge')).toEqual({
      'notification.nearbyRsvp': 'A few neighbours near you just RSVPed.',
    });
    expect(Object.keys(sample.wording('server'))).not.toContain('email.partnerDeclined.subject');
    expect(sample.wording('server')['email.listingInvite.subject']).toBe(
      'Is {$name} your organisation?',
    );
  });
});

describe('the feature list and the registry', () => {
  it('has no payment feature: the engine takes no payments', () => {
    const text = JSON.stringify([FEATURE_KEYS, COMPONENT_KEYS, CONTROL_KEYS]);
    expect(text).not.toMatch(/pay|billing|checkout|invoice|card|subscription/i);
  });

  it('a Citizens-line feature cannot be allowed on the engine line', () => {
    expect(featureAvailableOn('partnerInvitations', 'engine')).toBe(true);
    expect(featureAvailableOn('publicApi', 'engine')).toBe(false);
    expect(featureAvailableOn('publicApi', 'citizens')).toBe(true);
    expect(FEATURE_KEYS.filter((key) => FEATURES[key].line === 'citizens').sort()).toEqual([
      'aiSearch',
      'formIntake',
      'listingAutomation',
      'personalisationGames',
      'publicApi',
    ]);
  });

  it('knows its own feature keys', () => {
    expect(isFeatureKey('gatherings')).toBe(true);
    expect(isFeatureKey('payments')).toBe(false);
    expect(isFeatureKey('constructor')).toBe(false);
    expect(isFeatureKey(undefined)).toBe(false);
  });

  it('every part that names a feature names a real one, and no core part depends on a feature', () => {
    for (const key of COMPONENT_KEYS) {
      const definition: ComponentDefinition = COMPONENTS[key];
      if (definition.feature) expect(isFeatureKey(definition.feature), key).toBe(true);
      if (definition.core) expect(definition.feature, key).toBeUndefined();
      expect(definition.summary.length, key).toBeGreaterThan(0);
    }
    for (const key of CONTROL_KEYS) {
      const definition: ControlDefinition = CONTROLS[key];
      if (definition.feature) expect(isFeatureKey(definition.feature), key).toBe(true);
    }
  });

  it('every optional engine-line feature a tenant can be given has something to show for it', () => {
    const used = new Set<string>();
    for (const key of COMPONENT_KEYS)
      used.add((COMPONENTS[key] as ComponentDefinition).feature ?? '');
    for (const key of CONTROL_KEYS) used.add((CONTROLS[key] as ControlDefinition).feature ?? '');
    for (const feature of [
      'gatherings',
      'communityIdeas',
      'partnerApplications',
      'partnerInvitations',
      'partnerLevels',
      'liveLocation',
      'googleSignIn',
    ]) {
      expect(used.has(feature), feature).toBe(true);
    }
  });
});
