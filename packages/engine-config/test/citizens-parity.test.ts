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

/**
 * A source without its comments: lines that are a comment, and a comment at the end of a line
 * ("// " with a space after it, so a web address stays).
 */
const withoutComments = (source: string) =>
  source
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/\*|\*|\{\/\*|<!--)/.test(line))
    .map((line) => line.replace(/\s\/\/\s.*$/, ''))
    .join('\n');

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

async function load<T>(path: string): Promise<T> {
  const url = pathToFileURL(resolve(ROOT, path)).href;
  return (await import(/* @vite-ignore */ url)) as T;
}

let connect: ConnectCategories;

beforeAll(async () => {
  connect = await load<ConnectCategories>(`${CONNECT}/src/lib/categories.ts`);
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
    // The four kinds migration 173 stores, and the kind the screens used when none was picked.
    expect(config.categories.partnerKinds.map((kind) => [kind.id, kind.label])).toEqual([
      ['ministry', 'Ministry'],
      ['organization', 'Organisation'],
      ['business', 'Business'],
      ['individual', 'Individual'],
    ]);
    expect(config.categories.defaultPartnerKind).toBe('ministry');
  });

  it('the screens read the partner kinds from the world (step E7)', () => {
    for (const file of ['apply.jsx', 'admin.jsx', 'store.jsx']) {
      const source = raw(`${APP}/${file}`);
      expect(source, file).toContain('W.configuration.categories.partnerKinds.map(');
      expect(source, file).not.toContain("{ value: 'ministry', label:");
    }
    for (const file of ['apply.jsx', 'admin.jsx', 'store.jsx', 'pending-application.jsx']) {
      const source = raw(`${APP}/${file}`);
      expect(source, file).toContain('W.configuration.categories.defaultPartnerKind');
      expect(source, file).not.toContain("'ministry'");
    }
    expect(raw(`${APP}/onboarding-presets-lib.jsx`)).toContain(
      'const START_KIND = W.configuration.categories.defaultPartnerKind;',
    );
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
    'screen.ideas.mapType': { file: strings, wrap: (text) => `idea: '${text}'` },
    'screen.portal.title': { file: shell, wrap: (text) => `label: '${text}'` },
    'screen.claim.action': { file: shell },
    'screen.role.partner': { file: shell, wrap: (text) => `{ label: '${text}', color:` },
    'screen.wordmark.primary': { file: shell, wrap: (text) => `font-display' }, '${text}')` },
    'screen.wordmark.secondary': { file: shell, wrap: (text) => `uppercase mt-0.5' }, '${text}')` },
    'screen.map.type.partner': { file: strings, wrap: (text) => `contributor: '${text}'` },
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

  /**
   * Messages a Connect screen reads from the world since step E7. `text` is what the screen
   * showed before it was wired: the Citizens world must still render exactly that, the screen
   * must ask for the key, and its old copy must be gone.
   */
  const WIRED: Partial<Record<MessageKey, { files: readonly string[]; text: string }>> = {
    'meta.title': { files: [routes], text: 'Citizens Connect' },
    'screen.discover.title': { files: [routes], text: 'Kingdom Exploration' },
    'screen.gatherings.title': { files: [routes], text: "Let's…" },
    'screen.ideas.title': { files: [routes, pages], text: 'Kingdom Projects' },
    'screen.ideas.subtitle': {
      files: [pages],
      text: 'Suggest a need. Rally people. Launch it together.',
    },
    'screen.ideas.confirmed': { files: [pages], text: 'Confirmed Kingdom Project' },
    'screen.apply.pendingTitle': {
      files: [pages],
      text: 'Your Contributor application is being reviewed',
    },
    'screen.apply.invite': { files: [pages], text: 'Apply to become a Contributor' },
    'screen.communityEvents.rule': {
      files: [pages],
      text: 'Citizens can post one community-organised event each week.',
    },
    'screen.settings.weeklyDigest': {
      files: [pages],
      text: 'A weekly summary of Kingdom activity',
    },
    'screen.loading': { files: [`${APP}/auth.jsx`], text: 'Loading Citizens Connect' },
    'screen.wordmark.primary': { files: [`${APP}/auth.jsx`], text: 'Citizens' },
    'screen.signIn.epigraph': {
      files: [`${APP}/auth.jsx`],
      text: '"Now, therefore, you are no longer strangers and foreigners, but fellow —"',
    },
    'screen.signIn.epigraphNumber': { files: [`${APP}/auth.jsx`], text: '19' },
    'screen.listing.whereDirectory': {
      files: [`${APP}/data.jsx`, email],
      text: 'in Kingdom Discovery',
    },
    'screen.listing.whereMapAndDirectory': {
      files: [`${APP}/data.jsx`, email],
      text: 'on the map and in Kingdom Discovery',
    },
    'screen.role.partner': { files: [pages], text: 'Contributor' },
    'screen.map.type.partner': { files: [`${APP}/entity-card.jsx`], text: 'Contributor' },
    'screen.apply.title': {
      files: [routes, `${APP}/apply.jsx`, store],
      text: 'Become a Contributor',
    },
    'screen.apply.intro': {
      files: [`${APP}/apply.jsx`],
      text: 'Contributors create events & places, broadcast updates, message citizens, and lead Kingdom initiatives across the map.',
    },
    'screen.apply.aboutTitle': { files: [`${APP}/apply.jsx`], text: 'About your ministry' },
    'screen.apply.nameLabel': {
      files: [`${APP}/apply.jsx`, `${APP}/admin.jsx`, `${APP}/pending-application.jsx`],
      text: 'Organisation / ministry name',
    },
    'screen.apply.namePlaceholder': {
      files: [`${APP}/apply.jsx`, `${APP}/admin.jsx`],
      text: 'e.g. New Wine Fellowship',
    },
    'screen.apply.fallbackName': { files: [`${APP}/apply.jsx`], text: 'Your ministry' },
    'screen.apply.teamSubtitle': {
      files: [`${APP}/apply.jsx`],
      text: 'Add the people and channels behind your ministry.',
    },
    'screen.role.user': { files: [`${APP}/profiles.jsx`, `${APP}/messages.jsx`], text: 'Citizen' },
    'screen.fallback.userName': { files: [store], text: 'A Citizen' },
    'screen.fallback.partnerName': { files: [store], text: 'Unnamed Ministry' },
    'screen.fallback.ownPartnerName': { files: [store], text: 'My Ministry' },
    'screen.portal.title': {
      files: [`${APP}/listing-claim.jsx`, `${APP}/admin.jsx`, email],
      text: 'Contributor Portal',
    },
    'screen.admin.tab.partners': { files: [`${APP}/admin.jsx`], text: 'Contributors' },
    'screen.admin.tab.users': { files: [`${APP}/admin.jsx`], text: 'Citizens' },
    'screen.cohost.invite': { files: [`${APP}/cohosts.jsx`], text: 'Invite another Contributor.' },
    // Connect's own emails and calendar file, read from the world since step E7 part 2.
    'email.senderName': { files: [`${CONNECT}/src/lib/email/send.ts`], text: 'Citizens Connect' },
    'email.signOff': {
      files: [email],
      text: 'Connecting the Kingdom — one citizen, one contributor, one need at a time.\nThe Citizens Connect team',
    },
    'email.openApp': {
      files: [email, `${CONNECT}/src/lib/email/listingClaimTemplates.ts`],
      text: 'Open Citizens Connect',
    },
    'email.welcomeThanks': {
      files: [email],
      text: 'Thank you for joining the Body on Citizens Connect.',
    },
    'email.partnerApplication.adminSubject': {
      files: [email],
      text: 'New Contributor application: {$name}',
    },
    'email.partnerApproved.subject': {
      files: [email],
      text: "You're live on Citizens Connect: {$name}",
    },
    'email.partnerDeclined.subject': { files: [email], text: 'About your Contributor application' },
    'email.listingInvite.subject': { files: [email], text: 'Is {$name} your organisation?' },
    'meta.calendarProducer': {
      files: [`${CONNECT}/src/lib/calendar.ts`],
      text: 'Citizens Connect',
    },
  };

  /** Messages with nothing to compare: the text is empty in Connect today. */
  const EMPTY_TODAY: readonly MessageKey[] = ['meta.description'];

  /**
   * Messages Connect does not show today. The offline page was written by the service worker,
   * which was retired on 2026-11-12; the message stays in the catalogue for a world that has one.
   * The support-access notices are written only by a tenant's database (the engine line): the
   * Citizens database has no support sessions.
   */
  const NOT_SHOWN_TODAY: readonly MessageKey[] = [
    'screen.offline.body',
    'notification.supportAccess.opened.title',
    'notification.supportAccess.opened.body',
    'notification.supportAccess.requested.title',
    'notification.supportAccess.requested.body',
    'notification.supportAccess.ended.title',
    'notification.supportAccess.ended.body',
  ];

  it('every message is tied to the place Connect writes it', () => {
    const untied = MESSAGE_KEYS.filter(
      (key) =>
        !SOURCES[key] &&
        !WIRED[key] &&
        !EMPTY_TODAY.includes(key) &&
        !NOT_SHOWN_TODAY.includes(key),
    );
    expect(untied).toEqual([]);
    for (const key of NOT_SHOWN_TODAY) expect(SOURCES[key] ?? WIRED[key], key).toBeUndefined();
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

  it.each(Object.entries(WIRED))('%s is read from the world and reads as before', (key, wired) => {
    // With its {$name} values left in place, as the catalogue writes them.
    const text = world.wording(messageDefinition(key as MessageKey).renderedBy)[key];
    expect(text).toBe(wired.text);
    // The screens quote keys with ' and the server code with ".
    const asks = [`t('${key}'`, `t("${key}"`];
    for (const file of wired.files) {
      const contents = js(file);
      expect(
        asks.some((ask) => contents.includes(ask)),
        `${file} asks for ${key}`,
      ).toBe(true);
      // A text with a value in it was a template in the code, never one string to look for.
      // Comments may quote the old words; only code counts as a copy.
      if (!/\{\$/.test(wired.text)) {
        const code = withoutComments(contents);
        for (const copy of [`'${wired.text}'`, `"${wired.text}"`]) {
          expect(code, `${file} still holds its own copy of ${key}`).not.toContain(copy);
        }
      }
    }
  });

  it('the page title is also the app’s base title', () => {
    expect(js(routes)).toContain(`BASE_TITLE = window.WORLD.t('meta.title')`);
  });

  it('the rotating slogan has Connect’s nine phrases, in order, and the sign-in screen reads it', () => {
    // What the sign-in screen showed before step E7 part 2 read it from the world.
    expect(config.vocabulary.slogan).toEqual({
      lead: 'Connecting',
      phrases: [
        'Non-Profits to People',
        'Events to Interests',
        'Volunteers to Vacancies',
        'Leaders to Projects',
        'Ideas to Communities',
        'Churches to Numbers',
        'Limbs to Members',
        'Pretoria to Purpose',
        'the Kingdom',
      ],
    });
    const auth = js(`${APP}/auth.jsx`);
    expect(auth).toContain('const SLOGAN = W.configuration.vocabulary.slogan || null;');
    expect(auth).not.toContain("'Non-Profits to People'");
  });

  it('the terms are the words Connect uses', () => {
    expect(world.term('world')).toBe('Citizens Connect');
    expect(world.term('worldShort')).toBe('Citizens');
    expect(world.term('user', 'many')).toBe('Citizens');
    expect(world.term('partner', 'a')).toBe('a Contributor');
    expect(world.term('ideaProject', 'many')).toBe('Kingdom Projects');
    expect(world.term('discovery')).toBe('Kingdom Discovery');
    expect(world.term('user', 'One')).toBe('Citizen');
    expect(world.term('partner', 'One')).toBe('Contributor');
    expect(js(`${APP}/onboarding-presets-lib.jsx`)).toContain(
      `found in ' + W.term('discovery') + ' without it`,
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

  it('the ideas ladder is the one the ideas screen offered, and the screen reads it', () => {
    // What the ideas screen offered before step E7 part 2 read the ladder from the world.
    expect(config.ideas?.tiers.map((t) => [t.id, t.label, t.min, t.max, t.fixed])).toEqual([
      ['small_volunteer', 'Small Volunteer', 1, 20, false],
      ['community', 'Community', 20, 100, false],
      ['town', 'Town', 100, 1000, false],
      ['funders_challenge', 'Funders Challenge', 5000, 5000, true],
      ['provincial_vision', 'Provincial Vision', 10000, 10000, true],
    ]);
    const pages = raw(`${APP}/pages.jsx`);
    expect(pages).toContain('W.configuration.ideas ? W.configuration.ideas.tiers : []');
    expect(pages).not.toContain("label: 'Provincial Vision'");
  });

  it('Connect has no partner level ladder (founder, 2026-11-16)', () => {
    expect(config.partnerLevels).toBeUndefined();
    expect(existsSync(resolve(ROOT, `${CONNECT}/src/lib/contributors/involvement.ts`))).toBe(false);
    for (const file of ['store.jsx', 'profiles.jsx', 'shell.jsx', 'dashboard.jsx', 'data.jsx']) {
      expect(raw(`${APP}/${file}`), file).not.toMatch(/involvementLevel|Shepherd|TIERS = \[/);
    }
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
