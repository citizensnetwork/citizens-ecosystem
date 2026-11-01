import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APP_SLUGS, COMING_SOON, SITE_ORIGIN } from '@citizens/ecosystem';
import Landing, { config as landingConfig } from '../src/pages/citizens/index';
import ComingSoon, {
  config as soonConfig,
  getStaticPaths,
  getStaticProps,
} from '../src/pages/citizens/[slug]';
import NotFound, { config as notFoundConfig } from '../src/pages/404';
import { BUILT_APPS, SCRIPTURE, appCards, canonicalUrl } from '../src/lib/content';

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
/** The text inside a piece of markup: what follows each tag's closing ">" (no regex replace to get wrong). */
const textOf = (fragment: string) =>
  fragment
    .split('<')
    .map((part, i) => (i === 0 ? part : part.slice(part.indexOf('>') + 1)))
    .join('')
    .trim();
const links = (markup: string) =>
  [...markup.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: m[1] as string,
    text: textOf(m[2] as string),
  }));

describe('the landing page (/citizens)', () => {
  const markup = html(<Landing />);

  it('has one h1, the slogan, and the headings in order (no skipped level)', () => {
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).toMatch(/<h1[^>]*>Connecting the Kingdom<\/h1>/);
    const levels = [...markup.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]! - levels[i - 1]!, levels.join(',')).toBeLessThanOrEqual(1);
    }
  });

  it('has the landmarks: skip link, banner, main, footer', () => {
    expect(markup).toMatch(/<a class="skip-link" href="#main">/);
    expect(markup).toMatch(/<header\b/);
    expect(markup).toMatch(/<main id="main" /);
    expect(markup).toMatch(/<footer\b/);
  });

  it('shows a card for every built app, linking to its prefix, and one for every coming-soon app', () => {
    const found = links(markup);
    for (const slug of APP_SLUGS) {
      expect(found, slug).toContainEqual({
        href: `/citizens/${slug}`,
        text: `Open ${BUILT_APPS[slug].label}`,
      });
    }
    for (const app of COMING_SOON) {
      expect(found, app.slug).toContainEqual({
        href: `/citizens/${app.slug}`,
        text: `About ${app.label}`,
      });
    }
    expect(markup.match(/class="card( card-soon)?"/g)).toHaveLength(
      APP_SLUGS.length + COMING_SOON.length,
    );
  });

  it('names Wear and Impact on the landing page, spelled out (founder, 2026-11-01)', () => {
    const found = links(markup);
    expect(found).toContainEqual({ href: '/citizens/wear', text: 'Open Citizens Wear' });
    expect(found).toContainEqual({ href: '/citizens/impact', text: 'About Citizens Impact' });
  });

  it('says "Coming soon" in words on each unbuilt card (never colour alone)', () => {
    expect(markup.match(/Coming soon/g)).toHaveLength(COMING_SOON.length);
  });

  it('gives every link a distinct, descriptive name', () => {
    const names = links(markup)
      .map((l) => l.text)
      .filter((text) => text !== 'Skip to content');
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name.length, name).toBeGreaterThan(3);
  });

  it('quotes the founding Scripture exactly as VISION.md has it, with its reference', () => {
    expect(markup).toContain(SCRIPTURE.text);
    expect(markup).toMatch(/<figcaption>Ephesians 2:19-21<\/figcaption>/);
    expect(
      SCRIPTURE.text.startsWith('Now, therefore, you are no longer strangers and foreigners'),
    ).toBe(true);
    expect(SCRIPTURE.text.endsWith('grows into a holy temple in the Lord')).toBe(true);
  });

  it('has no script, no inline style, no inline handler and no external resource', () => {
    expect(markup).not.toMatch(/<script/i);
    expect(markup).not.toMatch(/\sstyle=/i);
    expect(markup).not.toMatch(/\son[a-z]+=/i);
    expect(markup).not.toMatch(/(?:src|href)="https?:/i);
  });

  it('ships no JavaScript at all', () => {
    expect(landingConfig).toEqual({ unstable_runtimeJS: false });
  });
});

describe('cards', () => {
  it('lists the built apps first, in registry order, then the coming-soon ones', () => {
    const cards = appCards();
    expect(cards.map((c) => c.slug)).toEqual([...APP_SLUGS, ...COMING_SOON.map((c) => c.slug)]);
    expect(cards.filter((c) => c.comingSoon).map((c) => c.slug)).toEqual(
      COMING_SOON.map((c) => c.slug),
    );
    for (const card of cards) {
      expect(card.href).toBe(`/citizens/${card.slug}`);
      expect(card.summary.length).toBeGreaterThan(20);
    }
  });

  it('builds the canonical address from the registry’s site origin', () => {
    expect(canonicalUrl('/citizens')).toBe(`${SITE_ORIGIN}/citizens`);
  });
});

describe('the coming-soon pages (/citizens/learn, /play, /move, /impact)', () => {
  it('are generated for exactly the registry’s coming-soon slugs, and nothing else is a page', async () => {
    const result = await getStaticPaths();
    expect(result.fallback).toBe(false);
    expect(result.paths).toEqual(COMING_SOON.map((app) => ({ params: { slug: app.slug } })));
  });

  it.each(COMING_SOON)('$slug: shows its name, its summary and a way back', async (app) => {
    const props = await getStaticProps({ params: { slug: app.slug } });
    expect(props).toEqual({ props: { label: app.label, summary: app.summary } });
    const markup = html(<ComingSoon label={app.label} summary={app.summary} />);
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).toContain(`>${app.label}</h1>`);
    expect(markup).toContain(app.summary);
    expect(markup).toContain('Coming soon');
    expect(links(markup)).toContainEqual({
      href: '/citizens',
      text: 'Back to the Citizens ecosystem',
    });
    expect(markup).not.toMatch(/<script/i);
  });

  it('is a 404 for any other slug (the built apps never reach this page)', async () => {
    for (const slug of ['connect', 'nope']) {
      expect(await getStaticProps({ params: { slug } })).toEqual({ notFound: true });
    }
    expect(await getStaticProps({})).toEqual({ notFound: true });
  });

  it('ships no JavaScript at all', () => {
    expect(soonConfig).toEqual({ unstable_runtimeJS: false });
  });
});

describe('the 404 page', () => {
  const markup = html(<NotFound />);

  it('says what happened and offers the way home', () => {
    expect(markup).toMatch(/<h1[^>]*>Page not found<\/h1>/);
    expect(links(markup)).toContainEqual({
      href: '/citizens',
      text: 'Back to the Citizens ecosystem',
    });
  });

  it('ships no JavaScript at all', () => {
    expect(notFoundConfig).toEqual({ unstable_runtimeJS: false });
    expect(markup).not.toMatch(/<script/i);
  });
});
