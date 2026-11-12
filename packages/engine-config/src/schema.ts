/**
 * The two documents of the contract, and the rules that check them.
 *
 * ENTITLEMENTS are written by the engine owner and kept in the control plane: which features a
 * world may switch on, its limits, and what the owner requires of it.
 *
 * A CONFIGURATION is written by the tenant and kept in the tenant's own project: its words,
 * colours, categories, layout and which allowed features are on.
 *
 * The one rule between them: a configuration can only switch on what its entitlements allow.
 * `validateConfiguration` enforces it, together with every other rule, and returns either the
 * checked document or a list of issues in plain language. Nothing here throws on bad input.
 *
 * A running world never calls the control plane (ADR-001, decision 3). It checks against a
 * read-only copy of its entitlements that the control plane writes into the tenant's project;
 * where that copy is stored is step E5's decision.
 */

import { z } from 'zod';
import {
  FEATURE_KEYS,
  FEATURES,
  featureAvailableOn,
  type FeatureKey,
  type SchemaLine,
} from './features';
import {
  COMPONENT_KEYS,
  componentDefinition,
  type ComponentKey,
  CONTROL_KEYS,
  controlDefinition,
  type ControlKey,
} from './registry';
import {
  COLOR_RE,
  COLOR_TOKENS,
  contrastFailures,
  contrastRatio,
  FONT_STACK_RE,
  isOpaqueHex,
  SOLID_HEX_RE,
  type ColorScheme,
  type ColorToken,
} from './theme';
import {
  ADDRESS_WORD_KEYS,
  ADDRESS_WORD_RE,
  MAX_ADDRESS_WORD_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_TERM_LENGTH,
  MESSAGE_KEYS,
  MESSAGES,
  parseTemplate,
  plainTextProblem,
  REQUIRED_TERMS,
  RESERVED_ADDRESS_WORDS,
  resolveAddressWords,
  TERM_KEYS,
  TERMS,
  type AddressWordKey,
  type MessageDefinition,
} from './vocabulary';
import { checkContractVersion } from './version';

/* ── Building blocks ───────────────────────────────────────────────── */

const asEnum = <T extends string>(keys: readonly T[]) => z.enum(keys as [T, ...T[]]);

/** One line of plain text: no markup, no control characters. */
const SINGLE_LINE_RE = /^[^<>\p{Cc}\u2028\u2029]*$/u;
const ID_RE = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const ICON_RE = /^[A-Z][A-Za-z0-9]{0,39}$/;
/**
 * A file on the world's own site, as a path from the world's root: icons/icon-192.png.
 * It has no leading slash, so it also resolves when a world is served under a prefix.
 * No other host, no "..", no "//", no query.
 */
const SITE_PATH_RE = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;

const line = (max: number) =>
  z.string().min(1).max(max).regex(SINGLE_LINE_RE, 'Use one line of plain text.');
const id = z.string().max(50).regex(ID_RE, 'Use lower-case letters, digits and hyphens.');
const icon = z.string().regex(ICON_RE, 'Use the name of an icon, such as "MapPin".');
const solidColor = z.string().regex(SOLID_HEX_RE, 'Use a hex colour such as #1a2b3c.');
const anyColor = z.string().max(40).regex(COLOR_RE, 'Use a hex colour or an rgb() value.');
const sitePath = z
  .string()
  .max(200)
  .regex(
    SITE_PATH_RE,
    'Use the path of a file on the world’s own site, from its root, such as icons/icon.png.',
  );
const keywords = z.array(line(60)).max(200).optional();
const contract = z.string().max(20);

/* ── Entitlements ──────────────────────────────────────────────────── */

export const entitlementsSchema = z.strictObject({
  contract,
  /** The database line the world runs on: the engine baseline, or the Citizens lineage. */
  schemaLine: z.enum(['engine', 'citizens']),
  /** The features the engine owner allows. A missing feature is not allowed. */
  features: z.partialRecord(asEnum(FEATURE_KEYS), z.boolean()),
  limits: z.strictObject({
    /** The steepest map tilt allowed, in degrees. 0 keeps the map flat (fewest tile requests). */
    mapTiltMaxDegrees: z.number().int().min(0).max(60),
    /** The most entries any one category list may hold. */
    maxCategoriesPerList: z.number().int().min(1).max(200),
  }),
  requirements: z.strictObject({
    /** The world must name its service provider on its legal page. */
    legalOperator: z.boolean(),
  }),
});

export type Entitlements = z.infer<typeof entitlementsSchema>;

/* ── Configuration ─────────────────────────────────────────────────── */

const termSchema = z.strictObject({
  one: line(MAX_TERM_LENGTH),
  many: line(MAX_TERM_LENGTH).optional(),
  article: z.enum(['a', 'an']).optional(),
  oneCapitalised: line(MAX_TERM_LENGTH).optional(),
  manyCapitalised: line(MAX_TERM_LENGTH).optional(),
});

const vocabularySchema = z.strictObject({
  terms: z.partialRecord(asEnum(TERM_KEYS), termSchema),
  /** The words this world shows in web addresses in place of the internal ones. */
  addresses: z.partialRecord(
    asEnum(ADDRESS_WORD_KEYS),
    z
      .string()
      .max(MAX_ADDRESS_WORD_LENGTH)
      .regex(ADDRESS_WORD_RE, 'Use lower-case letters, digits and hyphens.'),
  ),
  /** Messages this world words itself. Every other message uses the engine default. */
  messages: z.partialRecord(asEnum(MESSAGE_KEYS), z.string().max(MAX_MESSAGE_LENGTH)),
  /** The rotating slogan on the sign-in screen: a lead word and the phrases that follow it. */
  slogan: z.strictObject({ lead: line(40), phrases: z.array(line(60)).min(1).max(20) }).optional(),
});

const colorSetSchema = z.strictObject(
  Object.fromEntries(COLOR_TOKENS.map((token) => [token, anyColor])) as Record<
    ColorToken,
    typeof anyColor
  >,
);

const fontStack = z.string().max(200).regex(FONT_STACK_RE, 'Use font names separated by commas.');

const themeSchema = z.strictObject({
  light: colorSetSchema,
  dark: colorSetSchema,
  fonts: z.strictObject({ display: fontStack, body: fontStack }),
});

const categoriesSchema = z.strictObject({
  /** The groups shown as pills over the map, in pill order, each with its own colour. */
  mapGroups: z
    .array(
      z.strictObject({
        id,
        label: line(40),
        color: z.strictObject({ light: solidColor, dark: solidColor }),
      }),
    )
    .max(12),
  /** The groups named first on an event card ("Group | Category"). */
  cardGroups: z.array(z.strictObject({ id, label: line(40) })).max(12),
  events: z.array(
    z.strictObject({
      id,
      label: line(60),
      short: line(24),
      color: solidColor,
      icon,
      mapGroup: id,
      cardGroup: id.optional(),
      keywords,
    }),
  ),
  places: z.array(
    z.strictObject({
      id,
      label: line(60),
      short: line(24),
      description: line(120).optional(),
      color: solidColor,
      icon,
      mapGroup: id,
      keywords,
    }),
  ),
  /** What a partner does. Its own list, separate from event and place categories. */
  partnerTypes: z.array(
    z.strictObject({
      id,
      label: line(60),
      short: line(24),
      color: solidColor,
      icon,
      mapGroup: id,
      /** Staff look at an application of this type more closely before it goes live. */
      extraReview: z.boolean(),
    }),
  ),
  /** What a partner is (for example a business or an individual). */
  partnerKinds: z
    .array(z.strictObject({ id, label: line(40) }))
    .min(1)
    .max(12),
  defaultPartnerKind: id,
  /** The starters of the gatherings feature. Each one picks an event category. */
  gatheringStarters: z.array(z.strictObject({ id, label: line(40), category: id, icon })).max(24),
});

const appSchema = z.strictObject({
  /** The colour of the phone's title bar when the world is opened from the home screen. */
  themeColor: solidColor,
  /** The colour shown while the world starts. */
  backgroundColor: solidColor,
  display: z.enum(['standalone', 'minimal-ui', 'fullscreen', 'browser']),
  orientation: z.enum(['any', 'portrait', 'portrait-primary', 'landscape', 'landscape-primary']),
  /** The kinds of app this is, for a phone's app list ("social", "lifestyle"). */
  storeCategories: z.array(z.string().regex(/^[a-z]{2,24}$/)).max(6),
  icons: z
    .array(
      z.strictObject({
        src: sitePath,
        sizes: z.string().regex(/^[1-9]\d{1,3}x[1-9]\d{1,3}$/),
        type: z.enum(['image/png', 'image/svg+xml', 'image/webp']),
        purpose: z.enum(['any', 'maskable', 'any maskable', 'monochrome']),
      }),
    )
    .min(1)
    .max(12),
  faviconSrc: sitePath,
  /** The world's own mark, shown beside its name. */
  logoSrc: sitePath,
});

export const configurationSchema = z.strictObject({
  contract,
  /** Raised by one each time the tenant publishes a configuration. */
  revision: z.number().int().min(1),
  app: appSchema,
  legal: z.strictObject({
    /**
     * The service provider named on the world's legal page, as plain text. This is the only
     * place a world names the engine owner. Which legal name goes here is the owner's to decide.
     */
    serviceProvider: line(200).optional(),
  }),
  vocabulary: vocabularySchema,
  theme: themeSchema,
  categories: categoriesSchema,
  /** The features this world switches on. A missing feature is off. */
  features: z.partialRecord(asEnum(FEATURE_KEYS), z.boolean()),
  layout: z.strictObject({
    /** The optional components this world shows. Core components are always shown. */
    components: z.array(asEnum(COMPONENT_KEYS)).max(COMPONENT_KEYS.length),
    /** The main navigation, in order. */
    navigation: z.array(asEnum(COMPONENT_KEYS)).min(1).max(COMPONENT_KEYS.length),
    /** The controls this world shows. */
    controls: z.array(asEnum(CONTROL_KEYS)).max(CONTROL_KEYS.length),
  }),
  map: z.strictObject({
    /** The fixed tilt of the main map, in degrees from straight down. 0 is a flat map. */
    tiltDegrees: z.number().int().min(0).max(60),
    /** Where the map opens before it knows where the user is. */
    defaultCenter: z.strictObject({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }),
  }),
  /** The ideas board's ladder of goals. Needed while the ideas feature is on. */
  ideas: z
    .strictObject({
      tiers: z
        .array(
          z.strictObject({
            id,
            label: line(40),
            min: z.number().int().min(1),
            max: z.number().int().min(1),
            /** The goal is one fixed number; the person suggesting cannot choose it. */
            fixed: z.boolean(),
          }),
        )
        .min(1)
        .max(12),
    })
    .optional(),
  /** The partner level badges, lowest first. Needed while the levels feature is on. */
  partnerLevels: z
    .array(
      z.strictObject({
        id,
        label: line(40),
        color: solidColor,
        description: line(120),
        minScore: z.number().int().min(0),
      }),
    )
    .max(12)
    .optional(),
});

export type Configuration = z.infer<typeof configurationSchema>;

/** The configuration's shape as JSON Schema, for a database check or an admin form. */
export function configurationJsonSchema(): unknown {
  return z.toJSONSchema(configurationSchema, { unrepresentable: 'any' });
}

/** The entitlements' shape as JSON Schema. */
export function entitlementsJsonSchema(): unknown {
  return z.toJSONSchema(entitlementsSchema, { unrepresentable: 'any' });
}

/* ── Issues ────────────────────────────────────────────────────────── */

export type IssueCode =
  | 'unsupported-contract'
  | 'shape'
  | 'feature-outside-line'
  | 'feature-not-entitled'
  | 'feature-needs-data'
  | 'limit-exceeded'
  | 'legal-operator-required'
  | 'duplicate-id'
  | 'unknown-reference'
  | 'unknown-icon'
  | 'term-required'
  | 'term-shape'
  | 'message-text'
  | 'message-template'
  | 'address-reserved'
  | 'address-duplicate'
  | 'low-contrast'
  | 'layout-duplicate'
  | 'layout-needs-feature'
  | 'layout-not-navigable'
  | 'layout-not-shown'
  | 'tier-range'
  | 'level-order';

export interface Issue {
  readonly code: IssueCode;
  /** Where in the document, as a dotted path: "categories.events.3.mapGroup". */
  readonly path: string;
  /** What is wrong, in plain language, for the person editing the document. */
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export interface ValidationOptions {
  /** The icon names the app can draw. When given, an icon outside the list is an issue. */
  readonly knownIcons?: Iterable<string>;
}

function shapeIssues(error: z.ZodError, prefix = ''): Issue[] {
  return error.issues.map((issue) => ({
    code: 'shape' as const,
    path: prefix + issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function contractIssue(input: unknown, prefix = ''): Issue | null {
  const value =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>).contract
      : undefined;
  const check = checkContractVersion(value);
  return check.ok
    ? null
    : { code: 'unsupported-contract', path: `${prefix}contract`, message: check.message };
}

/* ── Entitlements: validation ──────────────────────────────────────── */

function entitlementIssues(input: unknown, prefix = ''): { value?: Entitlements; issues: Issue[] } {
  const versionIssue = contractIssue(input, prefix);
  if (versionIssue) return { issues: [versionIssue] };
  const parsed = entitlementsSchema.safeParse(input);
  if (!parsed.success) return { issues: shapeIssues(parsed.error, prefix) };

  const issues: Issue[] = [];
  const line: SchemaLine = parsed.data.schemaLine;
  for (const key of FEATURE_KEYS) {
    if (parsed.data.features[key] === true && !featureAvailableOn(key, line)) {
      issues.push({
        code: 'feature-outside-line',
        path: `${prefix}features.${key}`,
        message: `"${key}" needs the ${FEATURES[key].line} database line; this world runs on the ${line} line, so it cannot be allowed.`,
      });
    }
  }
  return issues.length > 0 ? { issues } : { value: parsed.data, issues };
}

export function validateEntitlements(input: unknown): ValidationResult<Entitlements> {
  const { value, issues } = entitlementIssues(input);
  return value ? { ok: true, value } : { ok: false, issues };
}

/* ── Configuration: validation ─────────────────────────────────────── */

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function checkFeatures(config: Configuration, entitlements: Entitlements, issues: Issue[]) {
  for (const key of FEATURE_KEYS) {
    if (config.features[key] !== true) continue;
    if (entitlements.features[key] !== true) {
      issues.push({
        code: 'feature-not-entitled',
        path: `features.${key}`,
        message: `"${key}" is switched on, but this world is not allowed that feature.`,
      });
    }
  }
  const needs: readonly [FeatureKey, boolean, string, string][] = [
    ['communityIdeas', config.ideas !== undefined, 'ideas', 'its ladder of goals (ideas.tiers)'],
    [
      'gatherings',
      config.categories.gatheringStarters.length > 0,
      'categories.gatheringStarters',
      'at least one gathering starter',
    ],
    [
      'partnerLevels',
      (config.partnerLevels?.length ?? 0) > 0,
      'partnerLevels',
      'at least one partner level',
    ],
  ];
  for (const [key, present, path, what] of needs) {
    if (config.features[key] === true && !present) {
      issues.push({
        code: 'feature-needs-data',
        path,
        message: `"${key}" is switched on, so the configuration must give ${what}.`,
      });
    }
  }
}

function checkLimits(config: Configuration, entitlements: Entitlements, issues: Issue[]) {
  const { mapTiltMaxDegrees, maxCategoriesPerList } = entitlements.limits;
  if (config.map.tiltDegrees > mapTiltMaxDegrees) {
    issues.push({
      code: 'limit-exceeded',
      path: 'map.tiltDegrees',
      message: `The map tilt is ${config.map.tiltDegrees} degrees; this world is allowed at most ${mapTiltMaxDegrees}.`,
    });
  }
  for (const list of ['events', 'places', 'partnerTypes'] as const) {
    const count = config.categories[list].length;
    if (count > maxCategoriesPerList) {
      issues.push({
        code: 'limit-exceeded',
        path: `categories.${list}`,
        message: `There are ${count} entries; this world is allowed at most ${maxCategoriesPerList} in one list.`,
      });
    }
  }
  if (entitlements.requirements.legalOperator && config.legal.serviceProvider === undefined) {
    issues.push({
      code: 'legal-operator-required',
      path: 'legal.serviceProvider',
      message: 'This world must name its service provider on its legal page.',
    });
  }
}

function checkCategories(config: Configuration, options: ValidationOptions, issues: Issue[]) {
  const c = config.categories;
  const lists: readonly [string, readonly { readonly id: string }[]][] = [
    ['categories.mapGroups', c.mapGroups],
    ['categories.cardGroups', c.cardGroups],
    ['categories.events', c.events],
    ['categories.places', c.places],
    ['categories.partnerTypes', c.partnerTypes],
    ['categories.partnerKinds', c.partnerKinds],
    ['categories.gatheringStarters', c.gatheringStarters],
    ['ideas.tiers', config.ideas?.tiers ?? []],
    ['partnerLevels', config.partnerLevels ?? []],
  ];
  for (const [path, entries] of lists) {
    for (const repeated of duplicates(entries.map((entry) => entry.id))) {
      issues.push({
        code: 'duplicate-id',
        path,
        message: `The id "${repeated}" is used more than once in this list.`,
      });
    }
  }

  const mapGroups = new Set(c.mapGroups.map((group) => group.id));
  const cardGroups = new Set(c.cardGroups.map((group) => group.id));
  const eventIds = new Set(c.events.map((event) => event.id));
  const reference = (path: string, value: string, known: ReadonlySet<string>, what: string) => {
    if (!known.has(value)) {
      issues.push({ code: 'unknown-reference', path, message: `"${value}" is not ${what}.` });
    }
  };
  c.events.forEach((event, i) => {
    reference(`categories.events.${i}.mapGroup`, event.mapGroup, mapGroups, 'a map group');
    if (event.cardGroup !== undefined) {
      reference(`categories.events.${i}.cardGroup`, event.cardGroup, cardGroups, 'a card group');
    }
  });
  c.places.forEach((place, i) => {
    reference(`categories.places.${i}.mapGroup`, place.mapGroup, mapGroups, 'a map group');
  });
  c.partnerTypes.forEach((type, i) => {
    reference(`categories.partnerTypes.${i}.mapGroup`, type.mapGroup, mapGroups, 'a map group');
  });
  c.gatheringStarters.forEach((starter, i) => {
    reference(
      `categories.gatheringStarters.${i}.category`,
      starter.category,
      eventIds,
      'an event category',
    );
  });
  reference(
    'categories.defaultPartnerKind',
    c.defaultPartnerKind,
    new Set(c.partnerKinds.map((kind) => kind.id)),
    'a partner kind',
  );

  if (options.knownIcons !== undefined) {
    const known = new Set(options.knownIcons);
    const iconLists: readonly [string, readonly { readonly icon: string }[]][] = [
      ['categories.events', c.events],
      ['categories.places', c.places],
      ['categories.partnerTypes', c.partnerTypes],
      ['categories.gatheringStarters', c.gatheringStarters],
    ];
    for (const [path, entries] of iconLists) {
      entries.forEach((entry, i) => {
        if (!known.has(entry.icon)) {
          issues.push({
            code: 'unknown-icon',
            path: `${path}.${i}.icon`,
            message: `"${entry.icon}" is not an icon the app can draw.`,
          });
        }
      });
    }
  }

  // A group colour is drawn as a dot and as text on all three surfaces, in both colour sets.
  for (const scheme of ['light', 'dark'] as const satisfies readonly ColorScheme[]) {
    c.mapGroups.forEach((group, i) => {
      for (const surface of ['surface0', 'surface1', 'surface2'] as const) {
        const background = config.theme[scheme][surface];
        if (!isOpaqueHex(background)) continue;
        const ratio = contrastRatio(group.color[scheme], background);
        if (ratio < 3) {
          issues.push({
            code: 'low-contrast',
            path: `categories.mapGroups.${i}.color.${scheme}`,
            message: `The ${scheme} colour of "${group.id}" is ${ratio.toFixed(2)}:1 against ${surface}; it needs at least 3:1.`,
          });
        }
      }
    });
  }
}

function checkVocabulary(config: Configuration, issues: Issue[]) {
  const { terms, messages, addresses } = config.vocabulary;
  for (const key of REQUIRED_TERMS) {
    if (!Object.hasOwn(terms, key)) {
      issues.push({
        code: 'term-required',
        path: `vocabulary.terms.${key}`,
        message: `Every world must set "${key}": ${TERMS[key].summary}`,
      });
    }
  }
  for (const key of TERM_KEYS) {
    const term = Object.hasOwn(terms, key) ? terms[key] : undefined;
    if (!term) continue;
    const kind: 'name' | 'noun' = TERMS[key].kind;
    if (kind === 'noun' && term.many === undefined) {
      issues.push({
        code: 'term-shape',
        path: `vocabulary.terms.${key}.many`,
        message: `"${key}" is counted, so it needs a plural.`,
      });
    }
    if (
      kind === 'name' &&
      (term.many !== undefined || term.manyCapitalised !== undefined || term.article !== undefined)
    ) {
      issues.push({
        code: 'term-shape',
        path: `vocabulary.terms.${key}`,
        message: `"${key}" is a name: it has no plural and no article.`,
      });
    }
  }

  for (const key of MESSAGE_KEYS) {
    const text = Object.hasOwn(messages, key) ? messages[key] : undefined;
    if (text === undefined) continue;
    const definition: MessageDefinition = MESSAGES[key];
    const textProblem = plainTextProblem(text, definition.singleLine !== true);
    if (textProblem) {
      issues.push({
        code: 'message-text',
        path: `vocabulary.messages.${key}`,
        message: textProblem,
      });
    }
    for (const problem of parseTemplate(text, definition.params ?? []).problems) {
      issues.push({
        code: 'message-template',
        path: `vocabulary.messages.${key}`,
        message: problem.detail,
      });
    }
  }

  const words = resolveAddressWords(addresses);
  for (const key of ADDRESS_WORD_KEYS) {
    if (RESERVED_ADDRESS_WORDS.has(words[key])) {
      issues.push({
        code: 'address-reserved',
        path: `vocabulary.addresses.${key}`,
        message: `"${words[key]}" is already the address of a part of the engine.`,
      });
    }
  }
  for (const repeated of duplicates(ADDRESS_WORD_KEYS.map((key: AddressWordKey) => words[key]))) {
    issues.push({
      code: 'address-duplicate',
      path: 'vocabulary.addresses',
      message: `"${repeated}" is used for more than one address word.`,
    });
  }
}

function checkTheme(config: Configuration, issues: Issue[]) {
  for (const scheme of ['light', 'dark'] as const) {
    for (const failure of contrastFailures(config.theme[scheme], scheme)) {
      issues.push({
        code: 'low-contrast',
        path: `theme.${scheme}.${failure.rule.foreground}`,
        message: `${failure.rule.foreground} on ${failure.rule.background} is ${failure.ratio.toFixed(2)}:1 (${failure.rule.why}); it needs at least ${failure.rule.minimum}:1.`,
      });
    }
  }
}

function checkLayout(config: Configuration, issues: Issue[]) {
  const { components, navigation, controls } = config.layout;
  const featureOn = (feature: FeatureKey | undefined) =>
    feature === undefined || config.features[feature] === true;
  const lists = { components, navigation, controls } as const;
  for (const name of ['components', 'navigation', 'controls'] as const) {
    for (const repeated of duplicates(lists[name])) {
      issues.push({
        code: 'layout-duplicate',
        path: `layout.${name}`,
        message: `"${repeated}" is listed more than once.`,
      });
    }
  }
  const needsFeature = (path: string, key: string, feature: FeatureKey | undefined) => {
    if (!featureOn(feature)) {
      issues.push({
        code: 'layout-needs-feature',
        path,
        message: `"${key}" needs the feature "${feature}", which is not switched on.`,
      });
    }
  };
  components.forEach((key: ComponentKey, i) => {
    const definition = componentDefinition(key);
    needsFeature(`layout.components.${i}`, key, definition.feature);
  });
  controls.forEach((key: ControlKey, i) => {
    const definition = controlDefinition(key);
    needsFeature(`layout.controls.${i}`, key, definition.feature);
  });
  const shown = new Set<ComponentKey>(components);
  navigation.forEach((key: ComponentKey, i) => {
    const definition = componentDefinition(key);
    if (definition.navigable !== true) {
      issues.push({
        code: 'layout-not-navigable',
        path: `layout.navigation.${i}`,
        message: `"${key}" cannot be placed in the navigation.`,
      });
    } else if (definition.core !== true && !shown.has(key)) {
      issues.push({
        code: 'layout-not-shown',
        path: `layout.navigation.${i}`,
        message: `"${key}" is in the navigation but not in the list of components this world shows.`,
      });
    }
  });
}

function checkLadders(config: Configuration, issues: Issue[]) {
  (config.ideas?.tiers ?? []).forEach((tier, i) => {
    if (tier.min > tier.max || (tier.fixed && tier.min !== tier.max)) {
      issues.push({
        code: 'tier-range',
        path: `ideas.tiers.${i}`,
        message: tier.fixed
          ? `"${tier.id}" is a fixed goal, so its lowest and highest number must be the same.`
          : `"${tier.id}" has a lowest number above its highest.`,
      });
    }
  });
  const levels = config.partnerLevels ?? [];
  levels.forEach((level, i) => {
    const previous = levels[i - 1];
    const wrong =
      previous === undefined ? level.minScore !== 0 : level.minScore <= previous.minScore;
    if (wrong) {
      issues.push({
        code: 'level-order',
        path: `partnerLevels.${i}.minScore`,
        message:
          previous === undefined
            ? 'The first level must start at a score of 0, so that every partner has a level.'
            : `"${level.id}" must start at a higher score than the level before it.`,
      });
    }
  });
}

/**
 * Checks a configuration against the contract AND against its entitlements. Both documents
 * are checked from scratch, so neither has to be trusted. Issues in the entitlements have a
 * path that starts with "entitlements:".
 */
export function validateConfiguration(
  input: unknown,
  entitlementsInput: unknown,
  options: ValidationOptions = {},
): ValidationResult<Configuration> {
  const checkedEntitlements = entitlementIssues(entitlementsInput, 'entitlements:');
  if (!checkedEntitlements.value) return { ok: false, issues: checkedEntitlements.issues };
  const entitlements = checkedEntitlements.value;

  const versionIssue = contractIssue(input);
  if (versionIssue) return { ok: false, issues: [versionIssue] };
  const parsed = configurationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: shapeIssues(parsed.error) };
  const config = parsed.data;

  const issues: Issue[] = [];
  checkFeatures(config, entitlements, issues);
  checkLimits(config, entitlements, issues);
  checkCategories(config, options, issues);
  checkVocabulary(config, issues);
  checkTheme(config, issues);
  checkLayout(config, issues);
  checkLadders(config, issues);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: config };
}
