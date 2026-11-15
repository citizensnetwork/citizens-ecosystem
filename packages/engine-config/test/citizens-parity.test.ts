/**
 * The Citizens configuration must reproduce today's app exactly.
 *
 * This test reads Connect's own files (never a copy) and fails when a value in the Citizens
 * configuration stops matching what Connect shows. It reads; it never changes Connect.
 * When step E7 makes Connect read from the configuration, each check here either goes (the
 * app no longer has its own copy) or turns into a check of the wiring.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ADDRESS_WORD_KEYS,
  ADDRESS_WORDS,
  citizensConfiguration,
  citizensEntitlements,
  createWorld,
  MESSAGE_KEYS,
  messageDefinition,
  RESERVED_ADDRESS_WORDS,
  type MessageKey,
  type WebManifest,
} from '../src/index';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const CONNECT = 'apps/connect';
const APP = `${CONNECT}/src/frontend/app`;
const BACKSLASH = String.fromCharCode(92);

const raw = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

/** A JS or TS source with string escapes undone, so text can be compared as a person reads it. */
function js(path: string): string {
  return raw(path).split(`${BACKSLASH}'`).join("'").split(`${BACKSLASH}n`).join('\n');
}

/** An SQL source with doubled quotes undone. */
const sql = (path: string) => raw(path).split("''").join("'");

/** A label as Connect's sources write it: double quotes when it holds an apostrophe. */
const quoted = (text: string) => (text.includes("'") ? `"${text}"` : `'${text}'`);

const squash = (value: string) => value.toLowerCase().replace(/\s+/g, '');

const config = citizensConfiguration;
const world = createWorld(citizensConfiguration, citizensEntitlements);

interface ConnectCategories {
  CATEGORY_LABELS: Record<string, string>;
  CATEGORY_LABELS_SHORT: Record<string, string>;
  CATEGORY_HEX: Record<string, string>;
  EVENT_CATEGORIES: { value: string; label: string }[];
  EVENT_GROUPS: readonly { id: string; label: string }[];
  EVENT_CATEGORY_GROUP: Record<string, string>;
  eventGroupHeading(category: string): string | undefined;
  PLACE_CATEGORY_LABELS: Record<string, string>;
  PLACE_CATEGORY_DESCRIPTIONS: Record<string, string>;
  PLACE_CATEGORY_HEX: Record<string, string>;
  PLACE_CATEGORIES: { value: string; label: string }[];
  CONTRIBUTOR_TYPES: readonly { value: string; label: string; hex: string; icon: string }[];
  EXTRA_REVIEW_CONTRIBUTOR_TYPES: readonly string[];
  PLACE_CATEGORY_KEYWORDS: Record<string, string[]>;
  EVENT_CATEGORY_KEYWORDS: Record<string, string[]>;
}

interface ConnectInvolvement {
  INVOLVEMENT_COLORS: Record<string, string>;
  INVOLVEMENT_DESCRIPTIONS: Record<string, string>;
  computeInvolvementLevel(signals: {
    followers: number;
    events: number;
    places: number;
    teamSize: number;
  }): string;
}

async function load<T>(path: string): Promise<T> {
  const url = pathToFileURL(resolve(ROOT, path)).href;
  return (await import(/* @vite-ignore */ url)) as T;
}

let connect: ConnectCategories;
let involvement: ConnectInvolvement;

beforeAll(async () => {
  connect = await load<ConnectCategories>(`${CONNECT}/src/lib/categories.ts`);
  involvement = await load<ConnectInvolvement>(`${CONNECT}/src/lib/contributors/involvement.ts`);
});

describe('the home-screen app', () => {
  it('builds the app file Connect serves', () => {
    // The contract writes app paths from the world's root with no leading slash, so they also
    // resolve under a prefix. Connect's own manifest is moving from "/icons/…" to "icons/…" for
    // the same reason. At the site root the two forms are one address, so paths are compared as
    // the addresses they resolve to, and every other field must be equal as written.
    const at = (path: string) => new URL(path, 'https://world.test/manifest.json').pathname;
    const resolved = (manifest: WebManifest) => ({
      ...manifest,
      start_url: at(manifest.start_url),
      icons: manifest.icons.map((icon) => ({ ...icon, src: at(icon.src) })),
    });
    const served = JSON.parse(raw(`${CONNECT}/public/manifest.json`)) as WebManifest;
    expect(resolved(world.manifest())).toEqual(resolved(served));
    expect(at(world.manifest().start_url)).toBe('/');
  });

  it('points at the favicon and the mark Connect has', () => {
    expect(raw(`${CONNECT}/src/frontend/index.html`)).toContain(`href="${config.app.faviconSrc}"`);
    expect(existsSync(resolve(ROOT, `${CONNECT}/src/frontend/${config.app.logoSrc}`))).toBe(true);
  });

  it('has no legal page and no description tag, as today', () => {
    expect(config.legal).toEqual({});
    expect(world.t('meta.description')).toBe('');
    expect(raw(`${CONNECT}/src/frontend/index.html`)).not.toMatch(/<meta[^>]+name="description"/);
  });
});

describe('event categories', () => {
  it('are the 17 Connect has, in order, with the same labels, colours and groups', () => {
    expect(config.categories.events.map((event) => event.id)).toEqual(
      connect.EVENT_CATEGORIES.map((category) => category.value),
    );
    for (const event of config.categories.events) {
      expect(event.label, event.id).toBe(connect.CATEGORY_LABELS[event.id]);
      expect(event.short, event.id).toBe(connect.CATEGORY_LABELS_SHORT[event.id]);
      expect(event.color, event.id).toBe(connect.CATEGORY_HEX[event.id]);
      expect(event.cardGroup, event.id).toBe(connect.EVENT_CATEGORY_GROUP[event.id]);
      expect(world.eventHeading(event.id), event.id).toBe(connect.eventGroupHeading(event.id));
    }
    expect(config.categories.cardGroups).toEqual(
      connect.EVENT_GROUPS.map((group) => ({ ...group })),
    );
  });

  it('carry the same search keywords, word for word', () => {
    for (const event of config.categories.events) {
      expect(event.keywords, event.id).toEqual(connect.EVENT_CATEGORY_KEYWORDS[event.id]);
    }
    expect(Object.keys(connect.EVENT_CATEGORY_KEYWORDS).sort()).toEqual(
      config.categories.events.map((event) => event.id).sort(),
    );
  });
});

describe('place categories and partner types', () => {
  it('places are the 10 Connect has, with the same labels, descriptions, colours and keywords', () => {
    expect(config.categories.places.map((place) => place.id)).toEqual(
      connect.PLACE_CATEGORIES.map((category) => category.value),
    );
    for (const place of config.categories.places) {
      expect(place.label, place.id).toBe(connect.PLACE_CATEGORY_LABELS[place.id]);
      expect(place.description, place.id).toBe(connect.PLACE_CATEGORY_DESCRIPTIONS[place.id]);
      expect(place.color, place.id).toBe(connect.PLACE_CATEGORY_HEX[place.id]);
      expect(place.keywords, place.id).toEqual(connect.PLACE_CATEGORY_KEYWORDS[place.id]);
    }
  });

  it('partner types are the 12 Connect has, with the same labels, colours, icons and review rule', () => {
    expect(
      config.categories.partnerTypes.map(({ id, label, color, icon }) => ({
        value: id,
        label,
        hex: color,
        icon,
      })),
    ).toEqual(connect.CONTRIBUTOR_TYPES.map((type) => ({ ...type })));
    expect(
      config.categories.partnerTypes.filter((type) => type.extraReview).map((type) => type.id),
    ).toEqual([...connect.EXTRA_REVIEW_CONTRIBUTOR_TYPES]);
  });

  it('the app’s own copy (data.jsx) has the same short labels and icons', () => {
    const lines = raw(`${APP}/data.jsx`).split('\n');
    const lists = [
      config.categories.events,
      config.categories.places,
      config.categories.partnerTypes,
    ];
    for (const list of lists) {
      for (const entry of list) {
        const wanted = [
          `id: '${entry.id}'`,
          `name: ${quoted(entry.label)}`,
          `short: ${quoted(entry.short)}`,
          `hex: '${entry.color}'`,
          `icon: '${entry.icon}'`,
        ];
        const found = lines.some((line) => wanted.every((piece) => line.includes(piece)));
        expect(found, `${entry.id} / ${entry.label}`).toBe(true);
      }
    }
  });

  it('partner kinds are Connect’s four, with the same default', () => {
    const apply = raw(`${APP}/apply.jsx`);
    for (const kind of config.categories.partnerKinds) {
      expect(apply).toContain(`{ value: '${kind.id}', label: '${kind.label}' }`);
    }
    expect(config.categories.partnerKinds).toHaveLength(4);
    expect(apply).toContain(`? value : '${config.categories.defaultPartnerKind}';`);
  });
});

describe('map groups', () => {
  const explore = raw(`${APP}/map-v2-explore.jsx`);

  it('place every category where Connect places it', () => {
    const block = explore.slice(
      explore.indexOf('const GROUP_OF = {'),
      explore.indexOf('const GROUPS = ['),
    );
    const groupOf = new Map<string, string>();
    for (const match of block.matchAll(/'?([a-z][a-z-]*)'?: '([a-z]+)'/g)) {
      groupOf.set(match[1] ?? '', match[2] ?? '');
    }
    expect(groupOf.size).toBe(30);
    const seen = new Set<string>();
    const lists = [
      config.categories.events,
      config.categories.places,
      config.categories.partnerTypes,
    ];
    for (const list of lists) {
      for (const entry of list) {
        expect(entry.mapGroup, entry.id).toBe(groupOf.get(entry.id));
        seen.add(entry.id);
      }
    }
    expect([...seen].sort()).toEqual([...groupOf.keys()].sort());
  });

  it('are in the order of the pills, with Connect’s labels and colours', () => {
    const pills = [...explore.matchAll(/\{ id: '([a-z]+)', group: true \}/g)].map(
      (match) => match[1],
    );
    expect(config.categories.mapGroups.map((group) => group.id)).toEqual(pills);

    const strings = raw(`${APP}/map-v2-strings.jsx`);
    const css = raw(`${CONNECT}/src/frontend/assets/map-v2.css`);
    const dark = css.slice(css.indexOf("[data-theme='dark'] {"));
    const light = css.slice(0, css.indexOf("[data-theme='dark'] {"));
    for (const group of config.categories.mapGroups) {
      expect(strings).toContain(`${group.id}: '${group.label}',`);
      expect(light).toContain(`--cat-${group.id}: ${group.color.light};`);
      expect(dark).toContain(`--cat-${group.id}: ${group.color.dark};`);
    }
  });
});

describe('theme', () => {
  /** Every `--name: value;` in a block of CSS. */
  function declarations(css: string): Map<string, string> {
    const found = new Map<string, string>();
    for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      found.set(match[1] ?? '', (match[2] ?? '').trim());
    }
    return found;
  }

  const css = raw(`${CONNECT}/src/frontend/assets/map-v2.css`);
  const darkStart = css.indexOf("[data-theme='dark'] {");
  const html = raw(`${CONNECT}/src/frontend/index.html`);
  const shellRoot = html.slice(
    html.indexOf(':root {'),
    html.indexOf('* { -webkit-tap-highlight-color'),
  );
  const lightBlock = css.slice(css.indexOf(':root {'), darkStart);
  const darkBlock = css.slice(darkStart, css.indexOf('}', darkStart));

  // What a page has today: the shell's block, then Map v2's, then (in the dark look) the dark block.
  const today = {
    light: new Map([...declarations(shellRoot), ...declarations(lightBlock)]),
    dark: new Map([
      ...declarations(shellRoot),
      ...declarations(lightBlock),
      ...declarations(darkBlock),
    ]),
  };

  it('finds the blocks it compares against', () => {
    expect(darkStart).toBeGreaterThan(0);
    expect(today.light.get('--gold')).toBe('#F2BD22');
    expect(today.light.get('--surface-0')).toBe('#f7f4ee');
    expect(today.dark.get('--surface-0')).toBe('#0a0908');
  });

  for (const scheme of ['light', 'dark'] as const) {
    it(`writes the ${scheme} colours and fonts Connect has today`, () => {
      const variables = world.cssVariables(scheme);
      expect(Object.keys(variables).length).toBeGreaterThanOrEqual(18);
      for (const [name, value] of Object.entries(variables)) {
        const current = today[scheme].get(name);
        expect(current, `${name} is not in Connect's stylesheets`).toBeDefined();
        expect(squash(value), name).toBe(squash(current ?? ''));
      }
    });
  }

  it('the home-screen theme colour is the brand colour', () => {
    expect(config.app.themeColor).toBe(config.theme.light.accent);
  });
});

describe('vocabulary', () => {
  const email = `${CONNECT}/src/lib/email/templates.ts`;
  const pages = `${APP}/pages.jsx`;
  const shell = `${APP}/shell.jsx`;
  const routes = `${APP}/routes.jsx`;
  const strings = `${APP}/map-v2-strings.jsx`;
  const store = `${APP}/store.jsx`;
  const migration = (name: string) => `supabase/migrations/${name}.sql`;

  /**
   * Where each message is written in Connect today. `wrap` puts the text back into the code
   * around it when the bare words would be too common to prove anything.
   */
  const SOURCES: Partial<Record<MessageKey, { file: string; wrap?: (text: string) => string }>> = {
    'screen.map.navLabel': { file: shell, wrap: (text) => `{ page: 'home', label: '${text}'` },
    'screen.discover.title': { file: routes, wrap: (text) => `'kingdom-discovery': '${text}'` },
    'screen.gatherings.title': { file: routes, wrap: (text) => `lets: '${text}'` },
    'screen.ideas.title': { file: routes, wrap: (text) => `community: '${text}'` },
    'screen.ideas.subtitle': { file: pages },
    'screen.ideas.confirmed': { file: pages },
    'screen.ideas.mapType': { file: strings, wrap: (text) => `idea: '${text}'` },
    'screen.apply.title': { file: routes, wrap: (text) => `apply: '${text}'` },
    'screen.apply.intro': { file: `${APP}/apply.jsx` },
    'screen.apply.aboutTitle': { file: `${APP}/apply.jsx`, wrap: (text) => `title: '${text}'` },
    'screen.apply.nameLabel': { file: `${APP}/apply.jsx`, wrap: (text) => `nameLabel: '${text}'` },
    'screen.apply.pendingTitle': { file: pages },
    'screen.apply.invite': { file: pages, wrap: (text) => `: '${text}')` },
    'screen.communityEvents.rule': { file: pages },
    'screen.portal.title': { file: shell, wrap: (text) => `label: '${text}'` },
    'screen.claim.action': { file: shell },
    'screen.role.partner': { file: shell, wrap: (text) => `label: level || '${text}'` },
    'screen.role.user': { file: `${APP}/profiles.jsx`, wrap: (text) => `}, '${text}')` },
    'screen.fallback.userName': { file: store, wrap: (text) => `|| '${text}'` },
    'screen.fallback.partnerName': { file: store, wrap: (text) => `: '${text}'` },
    'screen.fallback.ownPartnerName': { file: store, wrap: (text) => `|| '${text}'` },
    'screen.loading': { file: `${APP}/auth.jsx`, wrap: (text) => `'aria-label': '${text}'` },
    'screen.wordmark.primary': { file: shell, wrap: (text) => `font-display' }, '${text}')` },
    'screen.wordmark.secondary': { file: shell, wrap: (text) => `uppercase mt-0.5' }, '${text}')` },
    'screen.admin.tab.partners': {
      file: `${APP}/admin.jsx`,
      wrap: (text) => `value: 'contributors', label: '${text}'`,
    },
    'screen.admin.tab.users': {
      file: `${APP}/admin.jsx`,
      wrap: (text) => `value: 'citizens', label: '${text}'`,
    },
    'screen.map.type.partner': { file: strings, wrap: (text) => `contributor: '${text}'` },
    'screen.listing.whereDirectory': { file: `${APP}/data.jsx`, wrap: (text) => `: '${text}')` },
    'screen.listing.whereMapAndDirectory': {
      file: `${APP}/data.jsx`,
      wrap: (text) => `? '${text}'`,
    },
    'screen.settings.weeklyDigest': { file: pages },
    'screen.cohost.invite': { file: `${APP}/cohosts.jsx` },
    'email.senderName': {
      file: `${CONNECT}/src/lib/email/send.ts`,
      wrap: (text) => `EMAIL_FROM = "${text} <`,
    },
    'email.signOff': { file: email, wrap: (text) => `SIGN_OFF_TEXT = "${text}"` },
    'email.openApp': { file: email, wrap: (text) => `"${text}")` },
    'email.partnerApplication.adminSubject': { file: email },
    'email.partnerApproved.subject': { file: email },
    'email.partnerDeclined.subject': { file: email, wrap: (text) => `subject: "${text}"` },
    'email.listingInvite.subject': { file: email },
    'notification.nearbyRsvp': { file: 'supabase/functions/notify-nearby-rsvp/index.ts' },
    'notification.partnerApproved.title': {
      file: migration('180_contributor_applications_need_admin_approval'),
    },
    'notification.partnerApproved.body': {
      file: migration('180_contributor_applications_need_admin_approval'),
    },
    'notification.partnerDeclined.title': {
      file: migration('179_approve_resets_hidden_and_review_fixes'),
    },
    'notification.followedPartner.fallbackName': { file: migration('187_follower_notifications') },
    'notification.followedPartner.newEvent': { file: migration('187_follower_notifications') },
    'notification.followedPartner.newUpdate': { file: migration('187_follower_notifications') },
    'notification.ideaGoalReached.title': { file: migration('132_kingdom_projects_flow') },
    'notification.ideaGoalReached.body': { file: migration('132_kingdom_projects_flow') },
    'notification.ideaGoalReached.fallbackTitle': {
      file: migration('132_kingdom_projects_flow'),
      wrap: (text) => `coalesce(v_idea.title, '${text}')`,
    },
    'notification.ideaLead.title': { file: migration('132_kingdom_projects_flow') },
    'notification.ideaLead.body': { file: migration('132_kingdom_projects_flow') },
    'notification.ideaLead.fallbackTitle': {
      file: migration('132_kingdom_projects_flow'),
      wrap: (text) => `coalesce(v_idea.title, '${text}')`,
    },
    'notification.ideaScheduled.title': { file: migration('132_kingdom_projects_flow') },
    'notification.ideaScheduled.body': { file: migration('132_kingdom_projects_flow') },
    'notification.ideaScheduled.fallbackTitle': {
      file: migration('132_kingdom_projects_flow'),
      wrap: (text) => `coalesce(v_idea.title, '${text}')`,
    },
    'screen.ideas.eventTitle': {
      file: migration('132_kingdom_projects_flow'),
      wrap: (text) => `coalesce(v_idea.title, '${text}')`,
    },
    'screen.ideas.eventNote': { file: migration('132_kingdom_projects_flow') },
    'screen.ideas.eventLocation': {
      file: migration('132_kingdom_projects_flow'),
      wrap: (text) => `, '${text}')`,
    },
    'meta.title': {
      file: `${CONNECT}/src/frontend/index.html`,
      wrap: (text) => `<title>${text}</title>`,
    },
    'meta.calendarProducer': {
      file: `${CONNECT}/src/lib/calendar.ts`,
      wrap: (text) => `PRODID:-//${text}//EN`,
    },
    'manifest.name': {
      file: `${CONNECT}/public/manifest.json`,
      wrap: (text) => `"name": "${text}"`,
    },
    'manifest.shortName': {
      file: `${CONNECT}/public/manifest.json`,
      wrap: (text) => `"short_name": "${text}"`,
    },
    'manifest.description': {
      file: `${CONNECT}/public/manifest.json`,
      wrap: (text) => `"description": "${text}"`,
    },
  };

  /** Messages with nothing to compare: the text is empty in Connect today. */
  const EMPTY_TODAY: readonly MessageKey[] = ['meta.description'];

  /**
   * Messages Connect does not show today. The offline page was written by the service worker,
   * which was retired on 2026-11-12; the message stays in the catalogue for a world that has one.
   */
  const NOT_SHOWN_TODAY: readonly MessageKey[] = ['screen.offline.body'];

  it('every message is tied to the place Connect writes it', () => {
    const untied = MESSAGE_KEYS.filter(
      (key) => !SOURCES[key] && !EMPTY_TODAY.includes(key) && !NOT_SHOWN_TODAY.includes(key),
    );
    expect(untied).toEqual([]);
    for (const key of NOT_SHOWN_TODAY) expect(SOURCES[key], key).toBeUndefined();
    for (const key of EMPTY_TODAY) expect(world.t(key), key).toBe('');
  });

  it.each(Object.entries(SOURCES))('%s reads as it does in Connect today', (key, source) => {
    const text = world.wording(messageDefinition(key as MessageKey).renderedBy)[key];
    expect(text, `${key} is not rendered: is its feature on?`).toBeTypeOf('string');
    const contents = source.file.endsWith('.sql')
      ? sql(source.file)
      : source.file.endsWith('.json') || source.file.endsWith('.html')
        ? raw(source.file)
        : js(source.file);
    // A value such as {$name} is code in the source, so the text around it is what must match.
    const pieces = (text ?? '').split(/\{\$[A-Za-z0-9]+\}/);
    pieces.forEach((piece, index) => {
      const whole = pieces.length === 1 && source.wrap ? source.wrap(piece) : piece;
      expect(contents, `${key} [${index}]: ${JSON.stringify(whole)} in ${source.file}`).toContain(
        whole,
      );
    });
  });

  it('the page title is also the app’s base title', () => {
    expect(js(routes)).toContain(`BASE_TITLE = '${world.t('meta.title')}'`);
  });

  it('the rotating slogan has Connect’s nine phrases, in order', () => {
    const auth = js(`${APP}/auth.jsx`);
    const block = auth.slice(
      auth.indexOf('const PHRASES = ['),
      auth.indexOf('];', auth.indexOf('const PHRASES = [')),
    );
    const phrases = [...block.matchAll(/^\s+'([^']+)',/gm)].map((match) => match[1]);
    expect(config.vocabulary.slogan?.phrases).toEqual(phrases);
    expect(auth).toContain(`"${config.vocabulary.slogan?.lead} ___" rotating slogan`);
  });

  it('the terms are the words Connect uses', () => {
    expect(world.term('world')).toBe('Citizens Connect');
    expect(world.term('worldShort')).toBe('Citizens');
    expect(world.term('user', 'many')).toBe('Citizens');
    expect(world.term('partner', 'a')).toBe('a Contributor');
    expect(world.term('ideaProject', 'many')).toBe('Kingdom Projects');
    expect(js(`${APP}/onboarding-presets-lib.jsx`)).toContain(
      `found in ${world.term('discovery')} without it`,
    );
  });
});

describe('addresses', () => {
  it('Citizens keeps the internal words, so no address is rewritten', () => {
    for (const key of ADDRESS_WORD_KEYS) {
      expect(world.address(key), key).toBe(ADDRESS_WORDS[key].internal);
    }
  });

  it('those words are the ones in Connect’s routes', () => {
    const api = `${CONNECT}/src/app/api`;
    expect(existsSync(resolve(ROOT, api, world.address('partner')))).toBe(true);
    expect(existsSync(resolve(ROOT, api, world.address('partners')))).toBe(true);
    expect(existsSync(resolve(ROOT, api, 'admin', world.address('partners')))).toBe(true);
    expect(existsSync(resolve(ROOT, api, 'admin', world.address('users')))).toBe(true);
    expect(existsSync(resolve(ROOT, api, 'admin', world.address('partnerApplications')))).toBe(
      true,
    );
    expect(raw(`${APP}/routes.jsx`)).toContain(
      `const ADMIN_TABS = ['applications', 'overview', '${world.address('partners')}', '${world.address('users')}', 'reports'];`,
    );
  });

  it('every other first word of a Connect address is reserved for the engine', () => {
    const internal = new Set<string>(ADDRESS_WORD_KEYS.map((key) => ADDRESS_WORDS[key].internal));
    const folders = (path: string) =>
      readdirSync(resolve(ROOT, path), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    const routes = raw(`${APP}/routes.jsx`);
    const screens = [
      ...routes
        .slice(routes.indexOf('const STATIC_PATHS = {'), routes.indexOf('const PAGE_BY_SEGMENT'))
        .matchAll(/'\/([a-z]+)'/g),
    ].map((match) => match[1] ?? '');
    const prefixes = [
      ...(/const PREFIXES = \[[^\]]*\]/.exec(routes)?.[0] ?? '').matchAll(/'([a-z]+)'/g),
    ].map((match) => match[1] ?? '');
    const adminTabs = [
      ...(/const ADMIN_TABS = \[[^\]]*\]/.exec(routes)?.[0] ?? '').matchAll(/'([a-z]+)'/g),
    ].map((match) => match[1] ?? '');
    const owned = [
      ...screens,
      ...prefixes,
      ...adminTabs,
      ...folders(`${CONNECT}/src/app/api`),
      ...folders(`${CONNECT}/src/app/api/admin`),
    ].filter((word) => !internal.has(word) && !word.startsWith('['));
    expect(screens.length).toBeGreaterThan(8);
    expect(prefixes.length).toBeGreaterThan(4);
    for (const word of owned) expect(RESERVED_ADDRESS_WORDS.has(word), word).toBe(true);
  });
});

describe('layout, map and the rest', () => {
  it('the navigation is Connect’s tab bar, in order', () => {
    const shell = raw(`${APP}/shell.jsx`);
    const block = shell.slice(
      shell.indexOf('const BASE_TABS = ['),
      shell.indexOf('];', shell.indexOf('const BASE_TABS = [')),
    );
    const pages = [...block.matchAll(/\{ page: '([a-z-]+)'/g)].map((match) => match[1] ?? '');
    const component: Record<string, string> = {
      home: 'map',
      'kingdom-discovery': 'discover',
      lets: 'gatherings',
      messages: 'messages',
      notifications: 'notifications',
    };
    expect(pages.map((page) => component[page])).toEqual([...world.navigation]);
  });

  it('the map tilts and opens where Connect’s does', () => {
    expect(raw(`${APP}/map-v2-lib.jsx`)).toContain(`const PITCH = ${config.map.tiltDegrees};`);
    const { lat, lng } = config.map.defaultCenter;
    expect(raw(`${CONNECT}/src/lib/map/config.ts`)).toContain(
      `DEFAULT_CENTER: [number, number] = [${lat}, ${lng}];`,
    );
    expect(raw(`${APP}/map.jsx`)).toContain(`const PRETORIA = [${lng}, ${lat}];`);
  });

  it('the gathering starters are Connect’s eight', () => {
    const lets = raw(`${APP}/lets-lib.jsx`);
    for (const starter of config.categories.gatheringStarters) {
      expect(lets).toContain(
        `{ id: '${starter.id}', label: ${quoted(starter.label)}, category: '${starter.category}', icon: '${starter.icon}' }`,
      );
    }
    expect(config.categories.gatheringStarters).toHaveLength(
      (lets.match(/\{ id: '[a-z-]+', label: /g) ?? []).length,
    );
  });

  it('the ideas ladder is the one the ideas screen offers', () => {
    const pages = raw(`${APP}/pages.jsx`);
    const tiers = config.ideas?.tiers ?? [];
    for (const tier of tiers) {
      expect(pages).toContain(
        `{ id: '${tier.id}', label: '${tier.label}', min: ${tier.min}, max: ${tier.max}${tier.fixed ? ', fixed: true' : ''} }`,
      );
    }
    expect(tiers).toHaveLength(5);
  });

  it('the partner levels are the ones Connect computes, with the same colours and thresholds', () => {
    const levels = config.partnerLevels ?? [];
    expect(levels.map((level) => level.label)).toEqual(Object.keys(involvement.INVOLVEMENT_COLORS));
    const at = (followers: number) =>
      involvement.computeInvolvementLevel({ followers, events: 0, places: 0, teamSize: 0 });
    levels.forEach((level, index) => {
      expect(level.color, level.id).toBe(involvement.INVOLVEMENT_COLORS[level.label]);
      expect(level.description, level.id).toBe(involvement.INVOLVEMENT_DESCRIPTIONS[level.label]);
      expect(at(level.minScore), level.id).toBe(level.label);
      if (index > 0) expect(at(level.minScore - 1), level.id).toBe(levels[index - 1]?.label);
    });
  });

  it('the three environment switches are recorded at Connect’s default (off)', () => {
    const flags = raw(`${CONNECT}/src/lib/featureFlags.ts`);
    expect(flags).toMatch(/NEXT_PUBLIC_BETA_AI_SEARCH,\s*false\)/);
    expect(flags).toMatch(/NEXT_PUBLIC_BETA_EASTER_EGGS,\s*false\)/);
    expect(flags).toMatch(/NEXT_PUBLIC_BETA_LIVE_LOCATION,\s*false,?\s*\)/);
    expect(config.features.aiSearch).toBe(false);
    expect(config.features.personalisationGames).toBe(false);
    expect(config.features.liveLocation).toBe(false);
  });

  it('Google sign-in is offered, as today', () => {
    expect(raw(`${APP}/auth.jsx`)).toContain('Continue with Google');
    expect(world.hasControl('googleSignInButton')).toBe(true);
  });
});
