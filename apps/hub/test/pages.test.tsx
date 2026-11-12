import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APP_SLUGS, COMING_SOON, PATH_ROOT, SITE_ORIGIN } from '@citizens/ecosystem';
import { CONNECT_ROOT_PAGES, HUB_PAGES } from '../config/hub-config';
import { hasAppIcon } from '../src/components/Icons';
import Landing from '../src/pages/citizens/index';
import * as landingModule from '../src/pages/citizens/index';
import Ecosystem, { config as ecosystemConfig } from '../src/pages/citizens/ecosystem';
import HowItWorks, { config as howConfig } from '../src/pages/citizens/how-it-works';
import Philosophy, { config as philosophyConfig } from '../src/pages/citizens/philosophy';
import GetInvolved, { config as involvedConfig } from '../src/pages/citizens/get-involved';
import ComingSoon, {
  config as soonConfig,
  getStaticPaths,
  getStaticProps,
} from '../src/pages/citizens/[slug]';
import NotFound, { config as notFoundConfig } from '../src/pages/404';
import {
  BUILT_APPS,
  CONNECT,
  GET_INVOLVED,
  HOW,
  IMPACT_PROGRESSION,
  KINGDOM_PROJECTS,
  PAGES,
  PHILOSOPHY,
  PLATFORM_COPY,
  SCRIPTURE,
  appCards,
  canonicalUrl,
  navGroups,
  pageTitle,
  stepsFor,
} from '../src/lib/content';

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr']);

/**
 * The words an assistive technology reads from a piece of markup: everything except what sits inside an element that
 * is aria-hidden (or an svg). Entities are decoded, whitespace is collapsed.
 */
function assistiveText(fragment: string): string {
  const out: string[] = [];
  const open: boolean[] = [];
  let hidden = 0;
  for (const token of fragment.split(/(<[^>]+>)/g)) {
    if (token.startsWith('</')) {
      if (open.pop()) hidden -= 1;
    } else if (token.startsWith('<')) {
      const name = (/^<([a-zA-Z0-9]+)/.exec(token)?.[1] ?? '').toLowerCase();
      if (VOID.has(name) || token.endsWith('/>')) continue;
      const isHidden = /\saria-hidden="true"/.test(token) || name === 'svg';
      open.push(isHidden);
      if (isHidden) hidden += 1;
    } else if (!hidden) {
      out.push(token);
    }
  }
  return out
    .join('')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&') // last, so an encoded entity such as &amp;lt; is not unescaped twice
    .replace(/\s+/g, ' ')
    .trim();
}

const links = (markup: string) =>
  [...markup.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: m[1] as string,
    text: assistiveText(m[2] as string),
  }));

const headingLevels = (markup: string) =>
  [...markup.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));

const comingSoonPages = await Promise.all(
  COMING_SOON.map(async (app) => {
    const result = await getStaticProps({ params: { slug: app.slug } });
    if (!('props' in result)) throw new Error(`no props for ${app.slug}`);
    const props = await result.props;
    return { slug: app.slug, props, markup: html(<ComingSoon {...props} />) };
  }),
);

const landing = html(<Landing />);
const ecosystem = html(<Ecosystem />);
const how = html(<HowItWorks />);
const philosophy = html(<Philosophy />);
const involved = html(<GetInvolved />);
const notFound = html(<NotFound />);

const everyPage = [
  // The landing page is the one page with JavaScript: the Central feed (docs/central/CENTRAL_FEED_GUIDE.md).
  { name: '/citizens', markup: landing, config: (landingModule as { config?: unknown }).config },
  { name: '/citizens/ecosystem', markup: ecosystem, config: ecosystemConfig },
  { name: '/citizens/how-it-works', markup: how, config: howConfig },
  { name: '/citizens/philosophy', markup: philosophy, config: philosophyConfig },
  { name: '/citizens/get-involved', markup: involved, config: involvedConfig },
  ...comingSoonPages.map((p) => ({
    name: `/citizens/${p.slug}`,
    markup: p.markup,
    config: soonConfig,
  })),
  { name: '404', markup: notFound, config: notFoundConfig },
];

/** Every address a hub link may point at, and the markup of each hub page by its path (for page#anchor links). */
const knownAddresses = new Set<string>([
  ...HUB_PAGES,
  ...APP_SLUGS.map((s) => `${PATH_ROOT}/${s}`),
  ...COMING_SOON.map((a) => `${PATH_ROOT}/${a.slug}`),
  ...Object.values(CONNECT),
]);
const markupByPath = new Map(everyPage.map((page) => [page.name, page.markup]));

describe.each(everyPage)('every page: $name', ({ name, markup, config }) => {
  it('has one h1 and never skips a heading level', () => {
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    const levels = headingLevels(markup);
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]! - levels[i - 1]!, levels.join(',')).toBeLessThanOrEqual(1);
    }
  });

  it('has the landmarks: skip link, banner, labelled navigation, main, footer', () => {
    expect(markup).toMatch(/<a class="skip-link" href="#main">/);
    expect(markup).toMatch(/<header\b/);
    expect(markup).toMatch(/<nav class="nav" aria-label="Main">/);
    expect(markup).toMatch(/<nav aria-label="Footer">/);
    expect(markup).toMatch(/<main id="main" /);
    expect(markup).toMatch(/<footer\b/);
  });

  it('has no script, no inline style, no inline handler and no external resource', () => {
    expect(markup).not.toMatch(/<script/i);
    expect(markup).not.toMatch(/\sstyle=/i);
    expect(markup).not.toMatch(/\son[a-z]+=/i);
    expect(markup).not.toMatch(/(?:src|href)="(?:https?:)?\/\//i);
  });

  it('ships no JavaScript, except the landing page, which runs only the Central feed', () => {
    if (name === PATH_ROOT) expect(config).toBeUndefined();
    else expect(config).toEqual({ unstable_runtimeJS: false });
  });

  it('gives every image alt text and a size, and hides every svg from assistive technology', () => {
    for (const img of markup.match(/<img\b[^>]*>/g) ?? []) {
      expect(img, img).toMatch(/\salt="/);
      expect(img, img).toMatch(/\swidth="\d+"/);
      expect(img, img).toMatch(/\sheight="\d+"/);
    }
    for (const svg of markup.match(/<svg\b[^>]*>/g) ?? []) {
      expect(svg, svg).toMatch(/\saria-hidden="true"/);
    }
  });

  it('names every link, and links with the same name go to the same place', () => {
    const seen = new Map<string, string>();
    for (const { href, text } of links(markup)) {
      expect(text.length, `link to ${href} has no name`).toBeGreaterThan(0);
      const key = text.toLowerCase();
      expect(seen.get(key) ?? href, `"${text}" goes to two places`).toBe(href);
      seen.set(key, href);
    }
  });

  it('keeps every link on the site, and every in-page link has its target', () => {
    for (const { href } of links(markup)) {
      expect(
        href.startsWith('/') && !href.startsWith('//') ? true : href.startsWith('#'),
        href,
      ).toBe(true);
      if (href.startsWith('#')) expect(markup, href).toContain(`id="${href.slice(1)}"`);
    }
  });

  it('sends every link to an address that exists: a hub page, an app, a coming-soon page or a Connect screen, and every page#anchor to an id on that page', () => {
    for (const { href } of links(markup)) {
      if (href.startsWith('#')) continue;
      const [path, fragment] = href.split('#') as [string, string | undefined];
      expect(knownAddresses.has(path), `${href} is not a route`).toBe(true);
      if (fragment) {
        const target = markupByPath.get(path);
        expect(target, `${href}: the target is not a hub page`).toBeDefined();
        expect(target, href).toContain(`id="${fragment}"`);
      }
    }
  });
});

describe('the landing page (/citizens)', () => {
  it('opens with the slogan as the one h1, then the three verbs and the way in', () => {
    expect(landing).toMatch(/<h1[^>]*>Connecting the Kingdom\.<\/h1>/);
    expect(landing).toContain('Discover. Participate. Belong.');
    expect(links(landing)).toContainEqual({ href: '#ecosystem', text: 'Explore the Ecosystem' });
    expect(links(landing)).toContainEqual({ href: PAGES.getInvolved, text: 'Get Involved' });
    expect(landing).toContain('id="ecosystem"');
  });

  it('says what Citizens is in the founder’s words, before the tiles', () => {
    const at = (text: string) => landing.indexOf(text);
    expect(at('Citizens is an interconnected Kingdom environment')).toBeGreaterThan(-1);
    expect(at('Citizens is an interconnected Kingdom environment')).toBeLessThan(
      at('The Citizens Ecosystem'),
    );
  });

  it('shows one tile for every app, built apps first and then the coming-soon ones, each linking to its prefix', () => {
    const cards = appCards();
    expect(cards.map((c) => c.slug)).toEqual([...APP_SLUGS, ...COMING_SOON.map((a) => a.slug)]);
    expect(landing.match(/<li class="tile /g)).toHaveLength(APP_SLUGS.length + COMING_SOON.length);
    const found = links(landing);
    for (const card of cards) {
      const name = `${card.short} ${card.tileVerbs}${card.comingSoon ? ' Coming soon' : ''}`;
      expect(found, card.slug).toContainEqual({ href: `/citizens/${card.slug}`, text: name });
    }
    // tiles come in registry order
    const order = cards.map((c) => landing.indexOf(`class="tile-link" href="/citizens/${c.slug}"`));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('names Wear and Impact on the landing page, spelled out (founder, 2026-11-01)', () => {
    const found = links(landing).map((l) => l.text);
    expect(found).toContain('Wear Express & Collaborate');
    expect(found).toContain('Impact Collaborate & Transform Coming soon');
  });

  it('says "Coming soon" in words on each unbuilt tile (never colour alone), and nowhere else', () => {
    expect(landing.match(/Coming soon/g)).toHaveLength(COMING_SOON.length);
  });

  it('lets a lone last tile span the row (Impact, as in the design)', () => {
    expect(landing.match(/class="tile tile-impact tile-soon tile-wide"/g)).toHaveLength(1);
  });

  it('has the interconnected-community band, with the crown and the six parts (Vision is not one of them, on purpose)', () => {
    expect(landing).toContain('An Interconnected Community');
    expect(landing).toContain(
      'People, resources and opportunities, working together for lasting impact.',
    );
    expect(links(landing)).toContainEqual({ href: PAGES.howItWorks, text: 'Learn More' });
    expect(landing.match(/class="diagram-node"/g)).toHaveLength(6);
    expect(landing).toContain('href="/citizens-crown.png"');
  });

  it('quotes the founding Scripture exactly as VISION.md has it, with its reference', () => {
    expect(landing).toContain(SCRIPTURE.text);
    expect(landing).toMatch(/<figcaption>Ephesians 2:19-21<\/figcaption>/);
    expect(
      SCRIPTURE.text.startsWith('Now, therefore, you are no longer strangers and foreigners'),
    ).toBe(true);
    expect(SCRIPTURE.text.endsWith('grows into a holy temple in the Lord')).toBe(true);
  });

  it('ends with the line the design closes on', () => {
    expect(landing).toContain('Every Citizen has a part to play');
  });
});

describe('the menus', () => {
  const groups = navGroups();

  it('are three disclosures, Explore, Get involved and About, with Search and Join beside them', () => {
    expect(landing.match(/<details\b/g)).toHaveLength(3);
    expect(groups.map((g) => g.label)).toEqual(['Explore', 'Get involved', 'About']);
    for (const group of groups) {
      expect(landing, group.label).toMatch(
        new RegExp(`<summary>${group.label}<svg[^>]*>.*?</svg></summary>`),
      );
      expect(group.links.length, group.label).toBeGreaterThan(0);
    }
    expect(links(landing)).toContainEqual({ href: CONNECT.search, text: 'Search the Kingdom' });
    expect(links(landing)).toContainEqual({ href: CONNECT.home, text: 'Join' });
  });

  it('lead only to pages that exist: a hub page, an app or coming-soon page, or one of Connect’s own screens', () => {
    const exists = new Set<string>([
      ...HUB_PAGES,
      ...APP_SLUGS.map((s) => `${PATH_ROOT}/${s}`),
      ...COMING_SOON.map((a) => `${PATH_ROOT}/${a.slug}`),
      ...Object.values(CONNECT),
    ]);
    for (const group of groups) {
      for (const link of group.links) {
        const base = link.href.split('#')[0] as string;
        expect(exists.has(base), `${group.label}: ${link.label} -> ${link.href}`).toBe(true);
      }
    }
  });

  it('point every anchor at an id that the page really has', () => {
    const pages: Record<string, string> = {
      [PAGES.getInvolved]: involved,
      [PAGES.ecosystem]: ecosystem,
    };
    for (const group of groups) {
      for (const link of group.links) {
        const [path, fragment] = link.href.split('#') as [string, string | undefined];
        if (!fragment) continue;
        expect(pages[path], `${link.href}: no such page here`).toBeDefined();
        expect(pages[path], link.href).toContain(`id="${fragment}"`);
      }
    }
  });

  it('keep Explore in step with the registry: the ecosystem page, then every app', () => {
    const explore = groups[0]!.links.map((l) => l.href);
    expect(explore).toEqual([
      PAGES.ecosystem,
      ...APP_SLUGS.map((s) => `/citizens/${s}`),
      ...COMING_SOON.map((a) => `/citizens/${a.slug}`),
    ]);
  });
});

describe('platform copy', () => {
  it('has an entry for every app in the registry, and for nothing else', () => {
    expect(Object.keys(PLATFORM_COPY).sort()).toEqual(
      [...APP_SLUGS, ...COMING_SOON.map((a) => a.slug)].sort(),
    );
  });

  it('has a pictogram for every app', () => {
    for (const card of appCards()) expect(hasAppIcon(card.slug), card.slug).toBe(true);
  });

  it('draws each tile’s two verbs from the platform’s own three (the design’s pairs come from the conversation’s triples)', () => {
    for (const card of appCards()) {
      const pair = card.tileVerbs.split(' & ');
      expect(pair, card.slug).toHaveLength(2);
      for (const verb of pair) expect(card.verbs, `${card.slug}: ${verb}`).toContain(verb);
      expect(card.verbs).toHaveLength(3);
    }
  });

  it('lists what a person can do today for the built apps only', () => {
    for (const card of appCards()) {
      if (card.comingSoon) expect(card.today, card.slug).toEqual([]);
      else expect(card.today.length, card.slug).toBeGreaterThan(0);
    }
  });

  it('says where each platform takes part in "How it works"', () => {
    expect(stepsFor('connect')).toEqual(['01 Discover', '04 Participate']);
    expect(stepsFor('vision')).toEqual(['02 Organise', '05 Measure and Grow']);
    expect(stepsFor('impact')).toEqual(['03 Collaborate']);
    for (const slug of ['wear', 'play', 'move', 'learn']) {
      expect(stepsFor(slug), slug).toEqual(['04 Participate']);
    }
    for (const step of HOW.steps) {
      for (const slug of step.platforms) expect(PLATFORM_COPY[slug], slug).toBeDefined();
    }
  });

  it('keeps Vision to the contributing organisations: it never finds, discovers or identifies needs (founder, 2026-11-04)', () => {
    const vision = PLATFORM_COPY.vision!;
    const words = [
      vision.tagline,
      vision.description,
      ...(vision.today ?? []),
      BUILT_APPS.vision.summary,
      HOW.steps[1]!.text,
      HOW.steps[4]!.text,
      HOW.roles.rows.find((r) => r.slug === 'vision')!.role,
    ].join(' ');
    expect(words).not.toMatch(
      /\b(find|finds|finding|discover|discovers|identify|identifies)\b[^.]*\bneeds?\b/i,
    );
    expect(words).not.toMatch(/\bneeds?\b/i);
    expect(vision.description).toContain('organisations');
  });

  it('puts community needs in Connect, which is where they are suggested', () => {
    expect(HOW.steps[0]!.text).toContain('community needs');
    expect(HOW.steps[0]!.text).toContain('Connect');
    expect(HOW.roles.rows.find((r) => r.slug === 'connect')!.role).toContain('community needs');
  });

  it('keeps every hub page’s path in step between content.ts and the sitemap list', () => {
    expect([PATH_ROOT, ...Object.values(PAGES)]).toEqual([...HUB_PAGES]);
  });

  it('builds the canonical address from the registry’s site origin, and titles inner pages "Name: Citizens"', () => {
    expect(canonicalUrl('/citizens')).toBe(`${SITE_ORIGIN}/citizens`);
    expect(pageTitle('How it works')).toBe('How it works: Citizens');
  });
});

describe('Kingdom Projects is "Suggest a need" (founder, 2026-11-04)', () => {
  it('is explained as that, in four steps, with a way in', () => {
    expect(KINGDOM_PROJECTS.heading).toContain('Suggest a need');
    expect(KINGDOM_PROJECTS.heading).toContain('Kingdom Projects');
    expect(KINGDOM_PROJECTS.steps.map((s) => s.name)).toEqual([
      'Suggest a need',
      'Rally',
      'Launch',
      'Confirm and grow',
    ]);
    expect(links(how)).toContainEqual({
      href: CONNECT.kingdomProjects,
      text: KINGDOM_PROJECTS.cta,
    });
    expect(how).toContain('id="kingdom-projects"');
  });

  it('is the door behind every "Suggest a need" on the site', () => {
    const doors = GET_INVOLVED.audiences.flatMap((a) => a.doors);
    const suggest = doors.filter((d) => d.label === 'Suggest a need');
    expect(suggest).toEqual([{ label: 'Suggest a need', href: CONNECT.kingdomProjects }]);
  });

  it('quotes the tier sizes as Connect really has them (a small volunteer group up to 20 votes, a provincial vision of 10,000)', () => {
    const connectPages = readFileSync(
      fileURLToPath(new URL('../../connect/src/frontend/app/pages.jsx', import.meta.url)),
      'utf8',
    );
    expect(connectPages).toContain(
      "{ id: 'small_volunteer', label: 'Small Volunteer', min: 1, max: 20 }",
    );
    expect(connectPages).toContain(
      "{ id: 'provincial_vision', label: 'Provincial Vision', min: 10000, max: 10000, fixed: true }",
    );
    const rally = KINGDOM_PROJECTS.steps.find((step) => step.name === 'Rally')!.text;
    expect(rally).toContain('up to 20 votes');
    expect(rally).toContain('10,000 votes');
  });

  it('does not say that Vision, or a "second feature", does it', () => {
    const words = JSON.stringify(KINGDOM_PROJECTS);
    expect(words).not.toMatch(/Vision (finds|discovers|identifies)/i);
    expect(KINGDOM_PROJECTS.closing).toContain('Vision stays the internal workspace');
  });
});

describe('the ecosystem page (/citizens/ecosystem)', () => {
  it('has a section for every platform, with its three verbs and its description from the conversation', () => {
    for (const card of appCards()) {
      expect(ecosystem, card.slug).toContain(`id="${card.slug}"`);
      expect(ecosystem, card.slug).toContain(`${card.verbs.join('. ')}.`);
      expect(ecosystem, card.slug).toContain(card.description.replace(/'/g, '&#x27;'));
    }
  });

  it('says what you can do today for the built apps and the plan for the others, and "Coming soon" four times', () => {
    expect(ecosystem.match(/What you can do today/g)).toHaveLength(APP_SLUGS.length);
    expect(ecosystem.match(/>The plan</g)).toHaveLength(COMING_SOON.length);
    expect(ecosystem.match(/Coming soon/g)).toHaveLength(COMING_SOON.length);
  });

  it('opens each built app and describes each coming-soon one', () => {
    const found = links(ecosystem);
    for (const card of appCards()) {
      expect(found, card.slug).toContainEqual({
        href: card.href,
        text: `${card.comingSoon ? 'About' : 'Open'} ${card.label}`,
      });
    }
  });
});

describe('how it works (/citizens/how-it-works)', () => {
  it('has the five steps in order, with the platforms that take part', () => {
    const names = [...how.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(names.slice(0, 5)).toEqual([
      'Discover',
      'Organise',
      'Collaborate',
      'Participate',
      'Measure and Grow',
    ]);
    expect(how.match(/class="step-n"/g)).toHaveLength(5);
    expect(links(how)).toContainEqual({ href: '/citizens/connect', text: 'Connect' });
    expect(links(how)).toContainEqual({ href: '/citizens/impact', text: 'Impact' });
    expect(how).toContain(HOW.outro);
  });

  it('says who does what between Connect, Impact and Vision, and that it is not a fixed sequence', () => {
    expect(how).toContain('Who does what');
    for (const row of HOW.roles.rows) expect(how, row.slug).toContain(row.role);
    expect(how).toContain('not a fixed sequence');
  });
});

describe('our philosophy (/citizens/philosophy)', () => {
  it('has the five beliefs, the foundation with the Scripture, the closing message and the words we use', () => {
    expect(philosophy).toContain('A Kingdom built together.');
    expect(philosophy.match(/<ul class="ticks">[\s\S]*?<\/ul>/)?.[0].match(/<li>/g)).toHaveLength(
      PHILOSOPHY.beliefs.length,
    );
    expect(PHILOSOPHY.beliefs).toHaveLength(5);
    expect(philosophy).toContain(SCRIPTURE.text);
    expect(philosophy).toContain('Our foundation: Ephesians 2:19–22');
    expect(philosophy).toContain('Stronger together.');
    for (const item of PHILOSOPHY.words.items) {
      expect(philosophy, item.term).toContain(`<dt>${item.term}</dt>`);
    }
    expect(PHILOSOPHY.words.items.map((i) => i.term)).toEqual([
      'Kingdom',
      'Body',
      'Citizens',
      'Contributors',
    ]);
  });
});

describe('get involved (/citizens/get-involved)', () => {
  it('has the five audiences, each with an anchor, and every door goes somewhere that exists', () => {
    expect(GET_INVOLVED.audiences.map((a) => a.name)).toEqual([
      'Individuals',
      'Churches and Ministries',
      'Businesses and Brands',
      'NGOs and Community Organisations',
      'Educators and Development Partners',
    ]);
    const exists = new Set<string>([
      ...APP_SLUGS.map((s) => `${PATH_ROOT}/${s}`),
      ...COMING_SOON.map((a) => `${PATH_ROOT}/${a.slug}`),
      ...Object.values(CONNECT),
    ]);
    for (const audience of GET_INVOLVED.audiences) {
      expect(involved, audience.id).toContain(`id="${audience.id}"`);
      expect(audience.doors.length, audience.id).toBeGreaterThan(0);
      for (const door of audience.doors) {
        expect(exists.has(door.href), `${audience.id}: ${door.label} -> ${door.href}`).toBe(true);
        expect(links(involved), door.label).toContainEqual({ href: door.href, text: door.label });
      }
    }
  });

  it('ends with the contribution message and two ways on', () => {
    expect(involved).toContain('Your contribution matters. Find where you fit.');
    expect(links(involved)).toContainEqual({ href: PAGES.ecosystem, text: 'Explore Citizens' });
    expect(links(involved)).toContainEqual({ href: CONNECT.home, text: 'Become Involved' });
  });

  it('opens Connect only through screens its route table really has, at the address Connect serves them under the prefix', () => {
    const routes = readFileSync(
      fileURLToPath(new URL('../../connect/src/frontend/app/routes.jsx', import.meta.url)),
      'utf8',
    );
    // [CONNECT key, Connect's page name in routes.jsx, its app-relative path]
    const screens: [keyof typeof CONNECT, string, string][] = [
      ['search', 'kingdom-discovery', '/discover'],
      ['kingdomProjects', 'community', '/community'],
      ['lets', 'lets', '/lets'],
      ['apply', 'apply', '/apply'],
    ];
    for (const [key, page, path] of screens) {
      expect(routes, page).toMatch(new RegExp(`['"]?${page}['"]?:\\s*'${path}'`));
      expect(CONNECT[key], key).toBe(`/citizens/connect${path}`);
      // ...and Connect's server answers it on a refresh or a shared link (its next.config rewrite list; the hub's
      // CONNECT_ROOT_PAGES is kept equal to that list by hub-config.test.ts).
      expect(CONNECT_ROOT_PAGES, key).toContain(path.slice(1));
    }
    expect(CONNECT.home).toBe('/citizens/connect');
  });
});

describe('the coming-soon pages (/citizens/learn, /play, /move, /impact)', () => {
  it('are generated for exactly the registry’s coming-soon slugs, and nothing else is a page', async () => {
    // The page's getStaticPaths ignores its context argument, so call it the way it is written.
    const result = await (getStaticPaths as () => ReturnType<typeof getStaticPaths>)();
    expect(result.fallback).toBe(false);
    expect(result.paths).toEqual(COMING_SOON.map((app) => ({ params: { slug: app.slug } })));
  });

  it.each(COMING_SOON)(
    '$slug: shows its name, its three verbs, its summary and description, and a way back',
    async (app) => {
      const page = comingSoonPages.find((p) => p.slug === app.slug)!;
      const card = appCards().find((c) => c.slug === app.slug)!;
      expect(page.props.label).toBe(app.label);
      expect(page.props.summary).toBe(app.summary);
      expect(page.markup.match(/<h1\b/g)).toHaveLength(1);
      expect(page.markup).toContain(`>${app.label}</h1>`);
      expect(page.markup).toContain(`${card.verbs.join('. ')}.`);
      expect(page.markup).toContain(app.summary);
      expect(page.markup).toContain(card.description.replace(/'/g, '&#x27;'));
      expect(page.markup).toContain('Coming soon');
      expect(links(page.markup)).toContainEqual({
        href: '/citizens',
        text: 'Back to the Citizens ecosystem',
      });
    },
  );

  it('is a 404 for any other slug (the built apps never reach this page)', async () => {
    for (const slug of ['connect', 'nope']) {
      expect(await getStaticProps({ params: { slug } })).toEqual({ notFound: true });
    }
    expect(await getStaticProps({})).toEqual({ notFound: true });
  });

  it('shows the Impact progression, and says which steps already work in Kingdom Projects (and only Impact does)', () => {
    const impact = comingSoonPages.find((p) => p.slug === 'impact')!.markup;
    expect(IMPACT_PROGRESSION.steps.map((s) => s.name)).toEqual([
      'Proposed',
      'Agreed',
      'Funded',
      'Launched',
    ]);
    expect(IMPACT_PROGRESSION.steps.filter((s) => !s.today).map((s) => s.name)).toEqual(['Funded']);
    expect(impact.match(/Works today in Kingdom Projects/g)).toHaveLength(3);
    expect(impact.match(/Comes with Impact/g)).toHaveLength(1);
    expect(links(impact)).toContainEqual({
      href: CONNECT.kingdomProjects,
      text: IMPACT_PROGRESSION.cta,
    });
    expect(impact).toContain(IMPACT_PROGRESSION.note);
    expect(impact).not.toContain('This part of Citizens is not built yet.');
    for (const page of comingSoonPages.filter((p) => p.slug !== 'impact')) {
      expect(page.markup, page.slug).not.toContain('Comes with Impact');
      expect(page.markup, page.slug).toContain('This part of Citizens is not built yet.');
    }
  });
});

describe('the 404 page', () => {
  it('says what happened and offers the way home', () => {
    expect(notFound).toMatch(/<h1[^>]*>Page not found<\/h1>/);
    expect(links(notFound)).toContainEqual({
      href: '/citizens',
      text: 'Back to the Citizens ecosystem',
    });
  });
});
