import { describe, expect, it } from 'vitest';
import {
  citizensConfiguration,
  citizensEntitlements,
  configurationJsonSchema,
  entitlementsJsonSchema,
  FEATURE_KEYS,
  FEATURES,
  sampleConfiguration,
  sampleEntitlements,
  validateConfiguration,
  validateEntitlements,
  type Configuration,
} from '../src/index';
import { checkSample, clone, expectIssue, issuesOf } from './helpers';

describe('the two configurations in this repository', () => {
  it('the Citizens configuration is valid against the Citizens entitlements', () => {
    const result = validateConfiguration(citizensConfiguration, citizensEntitlements);
    expect(issuesOf(result)).toEqual([]);
    expect(result.ok && result.value).toEqual(citizensConfiguration);
  });

  it('the sample tenant is valid against its entitlements', () => {
    const result = validateConfiguration(sampleConfiguration, sampleEntitlements);
    expect(issuesOf(result)).toEqual([]);
    expect(result.ok && result.value).toEqual(sampleConfiguration);
  });

  it('both are plain data: they survive being stored as JSON and read back', () => {
    for (const [configuration, entitlements] of [
      [citizensConfiguration, citizensEntitlements],
      [sampleConfiguration, sampleEntitlements],
    ] as const) {
      const stored = JSON.parse(JSON.stringify(configuration)) as unknown;
      const result = validateConfiguration(stored, JSON.parse(JSON.stringify(entitlements)));
      expect(issuesOf(result)).toEqual([]);
      expect(stored).toEqual(configuration);
    }
  });

  it('checking a document does not change it', () => {
    const before = JSON.stringify(sampleConfiguration);
    validateConfiguration(sampleConfiguration, sampleEntitlements);
    expect(JSON.stringify(sampleConfiguration)).toBe(before);
  });
});

describe('entitlements', () => {
  it('accepts both sets in this repository', () => {
    expect(validateEntitlements(citizensEntitlements).ok).toBe(true);
    expect(validateEntitlements(sampleEntitlements).ok).toBe(true);
  });

  it('refuses a Citizens-line feature for a world on the engine line', () => {
    for (const key of FEATURE_KEYS.filter((feature) => FEATURES[feature].line === 'citizens')) {
      const entitlements = clone(sampleEntitlements);
      entitlements.features[key] = true;
      const issue = expectIssue(
        validateEntitlements(entitlements),
        'feature-outside-line',
        `features.${key}`,
      );
      expect(issue.message).toContain('cannot be allowed');
    }
  });

  it('a tenant cannot be given the public data feed (founder, 2026-11-11)', () => {
    const entitlements = clone(sampleEntitlements);
    entitlements.features.publicApi = true;
    expectIssue(validateEntitlements(entitlements), 'feature-outside-line', 'features.publicApi');
    // listing it as not allowed is fine
    entitlements.features.publicApi = false;
    expect(validateEntitlements(entitlements).ok).toBe(true);
  });

  it('refuses an unknown feature, an unknown field and a limit out of range', () => {
    const withFeature = { ...clone(sampleEntitlements), features: { payments: true } };
    expectIssue(validateEntitlements(withFeature), 'shape', 'features');
    expectIssue(validateEntitlements({ ...clone(sampleEntitlements), extra: 1 }), 'shape');
    const steep = clone(sampleEntitlements);
    steep.limits.mapTiltMaxDegrees = 61;
    expectIssue(validateEntitlements(steep), 'shape', 'limits.mapTiltMaxDegrees');
  });

  it('refuses a contract version it cannot read, before looking at anything else', () => {
    for (const contract of ['1.1', '2.0', '0.9', 'latest', undefined]) {
      const result = validateEntitlements({ ...clone(sampleEntitlements), contract });
      expect(issuesOf(result).map((issue) => issue.code)).toEqual(['unsupported-contract']);
    }
    expect(issuesOf(validateEntitlements(null)).map((issue) => issue.code)).toEqual([
      'unsupported-contract',
    ]);
    expect(issuesOf(validateEntitlements([])).map((issue) => issue.code)).toEqual([
      'unsupported-contract',
    ]);
  });
});

describe('the rule between the two layers', () => {
  it('a configuration cannot switch on a feature its entitlements do not allow', () => {
    const result = checkSample((configuration) => {
      configuration.features.partnerApplications = true;
    });
    const issue = expectIssue(result, 'feature-not-entitled', 'features.partnerApplications');
    expect(issue.message).toContain('not allowed');
  });

  it('a feature the entitlements never mention is not allowed either', () => {
    expectIssue(
      checkSample((configuration) => {
        configuration.features.partnerLevels = true;
        configuration.partnerLevels = clone(citizensConfiguration.partnerLevels);
      }),
      'feature-not-entitled',
      'features.partnerLevels',
    );
  });

  it('a tenant cannot switch on the public data feed', () => {
    expectIssue(
      checkSample((configuration) => {
        configuration.features.publicApi = true;
      }),
      'feature-not-entitled',
      'features.publicApi',
    );
  });

  it('switching a feature off, or leaving out an allowed one, is always fine', () => {
    expect(
      checkSample((configuration) => {
        configuration.features = { partnerApplications: false, communityIdeas: false };
        configuration.layout.components = ['explorePanel'];
        configuration.layout.navigation = ['map', 'discover'];
      }).ok,
    ).toBe(true);
  });

  it('the Citizens configuration is refused under the sample tenant’s entitlements', () => {
    const result = validateConfiguration(citizensConfiguration, sampleEntitlements);
    const codes = new Set(issuesOf(result).map((issue) => issue.code));
    expect(codes).toContain('feature-not-entitled');
    expect(codes).toContain('limit-exceeded');
    expect(codes).toContain('legal-operator-required');
  });

  it('bad entitlements fail the check, and say where', () => {
    const entitlements = clone(sampleEntitlements);
    entitlements.features.aiSearch = true;
    const issue = expectIssue(
      validateConfiguration(sampleConfiguration, entitlements),
      'feature-outside-line',
      'entitlements:features.aiSearch',
    );
    expect(issue.path).toBe('entitlements:features.aiSearch');
    expectIssue(
      validateConfiguration(sampleConfiguration, { contract: '1.0' }),
      'shape',
      'entitlements:',
    );
    expectIssue(
      validateConfiguration(sampleConfiguration, undefined),
      'unsupported-contract',
      'entitlements:contract',
    );
  });

  it('limits: the map tilt and the length of a category list', () => {
    expectIssue(
      checkSample((configuration) => {
        configuration.map.tiltDegrees = 45;
      }),
      'limit-exceeded',
      'map.tiltDegrees',
    );
    expect(
      checkSample((configuration) => {
        configuration.map.tiltDegrees = 30;
      }).ok,
    ).toBe(true);
    expectIssue(
      checkSample((_configuration, entitlements) => {
        entitlements.limits.maxCategoriesPerList = 3;
      }),
      'limit-exceeded',
      'categories.events',
    );
  });

  it('the legal page names the service provider when the engine owner requires it', () => {
    expectIssue(
      checkSample((configuration) => {
        configuration.legal = {};
      }),
      'legal-operator-required',
      'legal.serviceProvider',
    );
    expect(
      checkSample((configuration, entitlements) => {
        configuration.legal = {};
        entitlements.requirements.legalOperator = false;
      }).ok,
    ).toBe(true);
    // the field is plain text: any wording the owner chooses, but never markup
    expect(
      checkSample((configuration) => {
        configuration.legal.serviceProvider =
          'Service provided by 219 (registered name to follow).';
      }).ok,
    ).toBe(true);
    expectIssue(
      checkSample((configuration) => {
        configuration.legal.serviceProvider = '<a href="https://example.test">219</a>';
      }),
      'shape',
      'legal.serviceProvider',
    );
  });
});

describe('features that need data', () => {
  it('the ideas board needs its ladder of goals', () => {
    expectIssue(
      checkSample((configuration) => {
        configuration.features.communityIdeas = true;
      }),
      'feature-needs-data',
      'ideas',
    );
    expect(
      checkSample((configuration) => {
        configuration.features.communityIdeas = true;
        configuration.ideas = {
          tiers: [{ id: 'street', label: 'Street', min: 5, max: 40, fixed: false }],
        };
        configuration.layout.components.push('ideasBoard');
        configuration.vocabulary.terms.ideaProject = {
          one: 'street project',
          many: 'street projects',
        };
      }).ok,
    ).toBe(true);
  });

  it('gatherings need at least one starter, and partner levels at least one level', () => {
    expectIssue(
      checkSample((configuration) => {
        configuration.categories.gatheringStarters = [];
      }),
      'feature-needs-data',
      'categories.gatheringStarters',
    );
    const configuration = clone(citizensConfiguration);
    delete configuration.partnerLevels;
    expectIssue(
      validateConfiguration(configuration, citizensEntitlements),
      'feature-needs-data',
      'partnerLevels',
    );
    configuration.partnerLevels = [];
    expectIssue(
      validateConfiguration(configuration, citizensEntitlements),
      'feature-needs-data',
      'partnerLevels',
    );
  });

  it('a ladder tier must have a sensible range', () => {
    const withTier = (tier: NonNullable<Configuration['ideas']>['tiers'][number]) =>
      checkSample((configuration) => {
        configuration.ideas = { tiers: [tier] };
      });
    expectIssue(
      withTier({ id: 'a', label: 'A', min: 10, max: 5, fixed: false }),
      'tier-range',
      'ideas.tiers.0',
    );
    expectIssue(
      withTier({ id: 'a', label: 'A', min: 5, max: 10, fixed: true }),
      'tier-range',
      'ideas.tiers.0',
    );
    expect(withTier({ id: 'a', label: 'A', min: 5, max: 5, fixed: true }).ok).toBe(true);
  });

  it('partner levels start at 0 and rise', () => {
    const withLevels = (scores: number[]) => {
      const configuration = clone(citizensConfiguration);
      configuration.partnerLevels = scores.map((minScore, i) => ({
        id: `level-${i}`,
        label: `Level ${i}`,
        color: '#2563eb',
        description: 'A level',
        minScore,
      }));
      return validateConfiguration(configuration, citizensEntitlements);
    };
    expect(withLevels([0, 20, 80]).ok).toBe(true);
    expectIssue(withLevels([5, 20]), 'level-order', 'partnerLevels.0.minScore');
    expectIssue(withLevels([0, 20, 20]), 'level-order', 'partnerLevels.2.minScore');
    expectIssue(withLevels([0, 20, 10]), 'level-order', 'partnerLevels.2.minScore');
  });
});

describe('categories as data', () => {
  it('an id is used once in its list', () => {
    expectIssue(
      checkSample((configuration) => {
        const first = configuration.categories.events[0];
        if (first) configuration.categories.events.push(clone(first));
      }),
      'duplicate-id',
      'categories.events',
    );
    expectIssue(
      checkSample((configuration) => {
        configuration.categories.partnerKinds.push({ id: 'group', label: 'Group again' });
      }),
      'duplicate-id',
      'categories.partnerKinds',
    );
  });

  it('the same id may appear in different lists (an event category and a partner type)', () => {
    expect(
      checkSample((configuration) => {
        configuration.categories.partnerTypes.push({
          id: 'workshops',
          label: 'Workshop space',
          short: 'Space',
          color: '#b45309',
          icon: 'Hammer',
          mapGroup: 'make',
          extraReview: false,
        });
      }).ok,
    ).toBe(true);
  });

  it('every reference points at something that exists', () => {
    expectIssue(
      checkSample((configuration) => {
        const event = configuration.categories.events[1];
        if (event) event.mapGroup = 'nowhere';
      }),
      'unknown-reference',
      'categories.events.1.mapGroup',
    );
    expectIssue(
      checkSample((configuration) => {
        const event = configuration.categories.events[0];
        if (event) event.cardGroup = 'missing';
      }),
      'unknown-reference',
      'categories.events.0.cardGroup',
    );
    expectIssue(
      checkSample((configuration) => {
        const place = configuration.categories.places[0];
        if (place) place.mapGroup = 'nowhere';
      }),
      'unknown-reference',
      'categories.places.0.mapGroup',
    );
    expectIssue(
      checkSample((configuration) => {
        const type = configuration.categories.partnerTypes[2];
        if (type) type.mapGroup = 'nowhere';
      }),
      'unknown-reference',
      'categories.partnerTypes.2.mapGroup',
    );
    expectIssue(
      checkSample((configuration) => {
        const starter = configuration.categories.gatheringStarters[0];
        if (starter) starter.category = 'shared-gardens';
      }),
      'unknown-reference',
      'categories.gatheringStarters.0.category',
    );
    expectIssue(
      checkSample((configuration) => {
        configuration.categories.defaultPartnerKind = 'ministry';
      }),
      'unknown-reference',
      'categories.defaultPartnerKind',
    );
  });

  it('a tenant brings its own partner kinds; nothing assumes the Citizens ones', () => {
    const kinds = sampleConfiguration.categories.partnerKinds.map((kind) => kind.id);
    expect(kinds).not.toContain('ministry');
    expect(sampleConfiguration.categories.defaultPartnerKind).toBe('group');
  });

  it('checks icons against the app’s icon set when one is given', () => {
    const icons = ['Wrench', 'Hammer', 'Sprout', 'Utensils'];
    expect(checkSample(() => {}, { knownIcons: icons }).ok).toBe(true);
    expectIssue(
      checkSample(() => {}, { knownIcons: ['Wrench', 'Hammer', 'Sprout'] }),
      'unknown-icon',
      'categories.events.3.icon',
    );
    expectIssue(
      checkSample(
        (configuration) => {
          const starter = configuration.categories.gatheringStarters[1];
          if (starter) starter.icon = 'Shovel';
        },
        { knownIcons: new Set(icons) },
      ),
      'unknown-icon',
      'categories.gatheringStarters.1.icon',
    );
    // without an icon set, any well-formed icon name passes
    expect(
      checkSample((configuration) => {
        const starter = configuration.categories.gatheringStarters[1];
        if (starter) starter.icon = 'Shovel';
      }).ok,
    ).toBe(true);
  });

  it('a group colour must be readable on every surface, in both colour sets', () => {
    expectIssue(
      checkSample((configuration) => {
        const group = configuration.categories.mapGroups[0];
        if (group) group.color.light = '#f0e9d8';
      }),
      'low-contrast',
      'categories.mapGroups.0.color.light',
    );
    expectIssue(
      checkSample((configuration) => {
        const group = configuration.categories.mapGroups[2];
        if (group) group.color.dark = '#232a3d';
      }),
      'low-contrast',
      'categories.mapGroups.2.color.dark',
    );
    // a surface that is not a solid colour cannot be measured, so it is skipped
    expect(
      checkSample((configuration) => {
        configuration.theme.light.surface2 = 'rgba(233, 239, 236, 0.9)';
      }).ok,
    ).toBe(true);
  });
});

describe('vocabulary', () => {
  it('every world names itself', () => {
    expectIssue(
      checkSample((configuration) => {
        delete configuration.vocabulary.terms.world;
      }),
      'term-required',
      'vocabulary.terms.world',
    );
    expectIssue(
      checkSample((configuration) => {
        delete configuration.vocabulary.terms.worldShort;
      }),
      'term-required',
      'vocabulary.terms.worldShort',
    );
  });

  it('a counted term needs a plural; a name has none', () => {
    expectIssue(
      checkSample((configuration) => {
        configuration.vocabulary.terms.partner = { one: 'host' };
      }),
      'term-shape',
      'vocabulary.terms.partner.many',
    );
    for (const extra of [
      { many: 'Quillferns' },
      { manyCapitalised: 'Quillferns' },
      { article: 'a' as const },
    ]) {
      expectIssue(
        checkSample((configuration) => {
          configuration.vocabulary.terms.worldShort = { one: 'Quillfern', ...extra };
        }),
        'term-shape',
        'vocabulary.terms.worldShort',
      );
    }
  });

  it('a term is one line of plain text', () => {
    for (const one of ['', 'host\nhost', '<i>host</i>', 'x'.repeat(61)]) {
      expectIssue(
        checkSample((configuration) => {
          configuration.vocabulary.terms.partner = { one, many: 'hosts' };
        }),
        'shape',
        'vocabulary.terms.partner.one',
      );
    }
  });

  it('a message the tenant words must be a valid template', () => {
    const withMessage = (key: 'screen.apply.title' | 'email.listingInvite.subject', text: string) =>
      checkSample((configuration) => {
        configuration.vocabulary.messages[key] = text;
      });
    expect(withMessage('screen.apply.title', 'Join as {partner:a}').ok).toBe(true);
    expect(withMessage('email.listingInvite.subject', 'Does {$name} belong to you?').ok).toBe(true);
    expect(withMessage('screen.apply.title', '').ok).toBe(true);
    expectIssue(withMessage('screen.apply.title', 'Join the {staff}'), 'message-template');
    expectIssue(withMessage('screen.apply.title', 'Join {world:many}'), 'message-template');
    expectIssue(withMessage('screen.apply.title', 'Join {$name}'), 'message-template');
    expectIssue(withMessage('screen.apply.title', 'Join {partner'), 'message-template');
    expectIssue(
      withMessage('email.listingInvite.subject', 'Is {$name} yours?\nBcc: x@example.test'),
      'message-text',
    );
    expectIssue(withMessage('screen.apply.title', '<img src=x onerror=alert(1)>'), 'message-text');
    expectIssue(withMessage('screen.apply.title', 'x'.repeat(501)), 'shape');
  });

  it('a multi-line message may have line breaks; an unknown message key is refused', () => {
    expect(
      checkSample((configuration) => {
        configuration.vocabulary.messages['email.signOff'] =
          'See you on the street.\nThe {world} team';
      }).ok,
    ).toBe(true);
    const configuration = clone(sampleConfiguration) as unknown as {
      vocabulary: { messages: Record<string, string> };
    };
    configuration.vocabulary.messages['screen.made.up'] = 'x';
    expectIssue(
      validateConfiguration(configuration, sampleEntitlements),
      'shape',
      'vocabulary.messages',
    );
  });

  it('an address word cannot shadow a part of the engine, and each word is used once', () => {
    for (const reserved of ['admin', 'api', 'map', 'users', 'discover']) {
      expectIssue(
        checkSample((configuration) => {
          configuration.vocabulary.addresses.partners = reserved;
        }),
        'address-reserved',
        'vocabulary.addresses.partners',
      );
    }
    expectIssue(
      checkSample((configuration) => {
        configuration.vocabulary.addresses.users = 'hosts';
      }),
      'address-duplicate',
      'vocabulary.addresses',
    );
    // a default counts too: "partners" is the default word for the list of partners
    expectIssue(
      checkSample((configuration) => {
        configuration.vocabulary.addresses = { users: 'partners' };
      }),
      'address-duplicate',
      'vocabulary.addresses',
    );
    for (const bad of ['Hosts', 'ho sts', '../hosts', 'hosts/', 'x'.repeat(41)]) {
      expectIssue(
        checkSample((configuration) => {
          configuration.vocabulary.addresses.partners = bad;
        }),
        'shape',
        'vocabulary.addresses.partners',
      );
    }
  });

  it('a world may leave every address word and every message at the default', () => {
    expect(
      checkSample((configuration) => {
        configuration.vocabulary.addresses = {};
        configuration.vocabulary.messages = {};
      }).ok,
    ).toBe(true);
  });
});

describe('theme', () => {
  it('refuses a theme people cannot read', () => {
    const issue = expectIssue(
      checkSample((configuration) => {
        configuration.theme.light.text1 = '#e9efec';
      }),
      'low-contrast',
      'theme.light.text1',
    );
    expect(issue.message).toMatch(/needs at least 4\.5:1/);
    expectIssue(
      checkSample((configuration) => {
        configuration.theme.dark.accentContrast = '#2dd4bf';
      }),
      'low-contrast',
      'theme.dark.accentContrast',
    );
  });

  it('refuses anything that is not a colour or a font stack', () => {
    for (const value of [
      'red',
      'url(https://example.test/x.png)',
      '#fff;}body{display:none',
      'var(--x)',
    ]) {
      expectIssue(
        checkSample((configuration) => {
          configuration.theme.light.accent = value;
        }),
        'shape',
        'theme.light.accent',
      );
    }
    expectIssue(
      checkSample((configuration) => {
        configuration.theme.fonts.body = 'Inter; } * { display: none';
      }),
      'shape',
      'theme.fonts.body',
    );
    const missing = clone(sampleConfiguration) as unknown as {
      theme: { dark: Record<string, string> };
    };
    delete missing.theme.dark.surface2;
    expectIssue(validateConfiguration(missing, sampleEntitlements), 'shape', 'theme.dark.surface2');
  });
});

describe('layout', () => {
  it('a part is listed once', () => {
    expectIssue(
      checkSample((configuration) => {
        configuration.layout.controls.push('mapSearch');
      }),
      'layout-duplicate',
      'layout.controls',
    );
    expectIssue(
      checkSample((configuration) => {
        configuration.layout.navigation.push('map');
      }),
      'layout-duplicate',
      'layout.navigation',
    );
  });

  it('a part whose feature is off cannot be listed', () => {
    expectIssue(
      checkSample((configuration) => {
        configuration.layout.components.push('ideasBoard');
      }),
      'layout-needs-feature',
      'layout.components.5',
    );
    expectIssue(
      checkSample((configuration) => {
        configuration.layout.controls.push('liveLocationSwitch');
      }),
      'layout-needs-feature',
      'layout.controls.6',
    );
  });

  it('the navigation holds only screens that can be navigated to and that the world shows', () => {
    expectIssue(
      checkSample((configuration) => {
        configuration.layout.navigation.push('settings');
      }),
      'layout-not-navigable',
      'layout.navigation.4',
    );
    expectIssue(
      checkSample((configuration) => {
        configuration.layout.navigation.push('notifications');
        configuration.layout.components = configuration.layout.components.filter(
          (component) => component !== 'notifications',
        );
      }),
      'layout-not-shown',
      'layout.navigation.4',
    );
    expectIssue(
      checkSample((configuration) => {
        configuration.layout.navigation = [];
      }),
      'shape',
      'layout.navigation',
    );
  });

  it('refuses a part the registry does not know', () => {
    const configuration = clone(sampleConfiguration) as unknown as {
      layout: { components: string[] };
    };
    configuration.layout.components.push('adBanner');
    expectIssue(
      validateConfiguration(configuration, sampleEntitlements),
      'shape',
      'layout.components',
    );
  });
});

describe('the home-screen app, the map and the document itself', () => {
  it('an app file path stays on the world’s own site', () => {
    for (const src of [
      'https://example.test/icon.png',
      '//example.test/icon.png',
      '/../secrets/icon.png',
      '/icons/../icon.png',
      'icons/icon.png',
      '/icons/icon',
      '/icons/icon.png?x=1',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
    ]) {
      expectIssue(
        checkSample((configuration) => {
          const icon = configuration.app.icons[0];
          if (icon) icon.src = src;
        }),
        'shape',
        'app.icons.0.src',
      );
    }
    expectIssue(
      checkSample((configuration) => {
        configuration.app.logoSrc = 'https://example.test/logo.svg';
      }),
      'shape',
      'app.logoSrc',
    );
  });

  it('the app needs an icon and solid colours', () => {
    expectIssue(
      checkSample((configuration) => {
        configuration.app.icons = [];
      }),
      'shape',
      'app.icons',
    );
    expectIssue(
      checkSample((configuration) => {
        configuration.app.themeColor = 'rgba(0, 0, 0, 0.5)';
      }),
      'shape',
      'app.themeColor',
    );
  });

  it('the map tilt and centre are within range', () => {
    for (const [change, path] of [
      [(c: Configuration) => void (c.map.tiltDegrees = 61), 'map.tiltDegrees'],
      [(c: Configuration) => void (c.map.tiltDegrees = -1), 'map.tiltDegrees'],
      [(c: Configuration) => void (c.map.tiltDegrees = 12.5), 'map.tiltDegrees'],
      [(c: Configuration) => void (c.map.defaultCenter.lat = 91), 'map.defaultCenter.lat'],
      [(c: Configuration) => void (c.map.defaultCenter.lng = -181), 'map.defaultCenter.lng'],
    ] as const) {
      expectIssue(checkSample(change), 'shape', path);
    }
  });

  it('refuses a contract version it cannot read, an unknown field and a bad revision', () => {
    for (const contract of ['1.1', '2.0', '0.1', '', 1]) {
      const result = validateConfiguration(
        { ...clone(sampleConfiguration), contract },
        sampleEntitlements,
      );
      expect(issuesOf(result).map((issue) => issue.code)).toEqual(['unsupported-contract']);
    }
    expectIssue(
      validateConfiguration('not a document', sampleEntitlements),
      'unsupported-contract',
      'contract',
    );
    expectIssue(
      validateConfiguration({ ...clone(sampleConfiguration), payments: {} }, sampleEntitlements),
      'shape',
    );
    expectIssue(
      validateConfiguration({ ...clone(sampleConfiguration), revision: 0 }, sampleEntitlements),
      'shape',
      'revision',
    );
    expectIssue(validateConfiguration({ contract: '1.0' }, sampleEntitlements), 'shape');
  });

  it('a document cannot reach the prototype of the objects it is checked with', () => {
    const hostile = JSON.parse(
      JSON.stringify(sampleConfiguration).replace(
        '"features":{',
        '"features":{"__proto__":{"publicApi":true},"constructor":true,',
      ),
    ) as unknown;
    const result = validateConfiguration(hostile, sampleEntitlements);
    expect(result.ok).toBe(false);
    expect(({} as Record<string, unknown>).publicApi).toBeUndefined();
  });

  it('reports every problem at once, each with a path and a plain message', () => {
    const result = checkSample((configuration) => {
      configuration.features.partnerApplications = true;
      configuration.map.tiltDegrees = 60;
      configuration.legal = {};
      configuration.categories.defaultPartnerKind = 'nobody';
    });
    const issues = issuesOf(result);
    expect(issues.map((issue) => issue.code).sort()).toEqual([
      'feature-not-entitled',
      'legal-operator-required',
      'limit-exceeded',
      'unknown-reference',
    ]);
    for (const issue of issues) {
      expect(issue.path.length).toBeGreaterThan(0);
      expect(issue.message).toMatch(/^[A-Z"].*[.a-z0-9]$/);
    }
  });
});

describe('JSON Schema', () => {
  it('describes both documents, for a database check or an admin form', () => {
    const configuration = configurationJsonSchema() as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(configuration.type).toBe('object');
    expect(Object.keys(configuration.properties).sort()).toEqual([
      'app',
      'categories',
      'contract',
      'features',
      'ideas',
      'layout',
      'legal',
      'map',
      'partnerLevels',
      'revision',
      'theme',
      'vocabulary',
    ]);
    expect(configuration.required).not.toContain('ideas');
    const entitlements = entitlementsJsonSchema() as { properties: Record<string, unknown> };
    expect(Object.keys(entitlements.properties).sort()).toEqual([
      'contract',
      'features',
      'limits',
      'requirements',
      'schemaLine',
    ]);
  });
});
