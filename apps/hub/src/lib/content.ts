import { APP_SLUGS, COMING_SOON, PATH_ROOT, SITE_ORIGIN } from '@citizens/ecosystem';
import type { AppSlug } from '@citizens/ecosystem';

/**
 * Every word the front door shows, in one file. The wording is taken from apps/connect/VISION.md (the slogan, the
 * "why we exist" line, the creed, the ecosystem list and the founding Scripture); the founder reviews any change.
 * The coming-soon names and one-liners live in the registry (packages/ecosystem), next to their slugs.
 */

export const SLOGAN = 'Connecting the Kingdom';

export const SITE_NAME = 'Citizens';

/** The page <title> and description of the landing page. */
export const LANDING_TITLE = `${SITE_NAME}: ${SLOGAN}`;
export const LANDING_DESCRIPTION =
  'Citizens connects citizens to their ideal spaces, contributors to their ideal members, and needs to their ideal heroes.';

/** The hero: the creed's first line, then the line about the smallest contributor. */
export const HERO_LEAD = 'We help connect people to where they belong.';
export const HERO_BODY =
  'Every citizen and every contributor, no matter how small, is a contributing, important and necessary part of the whole Body.';

export const ECOSYSTEM_HEADING = 'The Citizens ecosystem';

/** The built apps, from VISION.md's ecosystem list. A Record over AppSlug, so a new app cannot ship without a card. */
export const BUILT_APPS: Record<AppSlug, { label: string; summary: string }> = {
  connect: {
    label: 'Citizens Connect',
    summary: 'The discovery and connection layer: map, events, places, contributors and community.',
  },
  vision: {
    label: 'Citizens Vision',
    summary:
      'The intelligence and impact layer: organisations see their real community impact, reach and engagement.',
  },
  wear: {
    label: 'Citizens Wear',
    summary: 'Kingdom-aligned fashion and ethical, community-rooted brands.',
  },
};

/** Ephesians 2:19-21, word for word as it stands in VISION.md. */
export const SCRIPTURE = {
  text: 'Now, therefore, you are no longer strangers and foreigners, but fellow citizens with the saints and members of the household of God, having been built on the foundation of the apostles and prophets, Jesus Christ Himself being the chief cornerstone, in whom the whole building, being fitted together, grows into a holy temple in the Lord',
  reference: 'Ephesians 2:19-21',
};

export const COMING_SOON_BADGE = 'Coming soon';
export const COMING_SOON_NOTE = 'This part of Citizens is not built yet.';
export const BACK_TO_ECOSYSTEM = 'Back to the Citizens ecosystem';

export const NOT_FOUND_TITLE = 'Page not found';
export const NOT_FOUND_BODY = 'This address is not part of Citizens.';

export interface AppCard {
  slug: string;
  label: string;
  summary: string;
  href: string;
  comingSoon: boolean;
}

/** The landing page's cards: the built apps first (registry order), then the coming-soon ones. */
export function appCards(): AppCard[] {
  return [
    ...APP_SLUGS.map((slug) => ({
      slug,
      ...BUILT_APPS[slug],
      href: `${PATH_ROOT}/${slug}`,
      comingSoon: false,
    })),
    ...COMING_SOON.map((app) => ({
      slug: app.slug,
      label: app.label,
      summary: app.summary,
      href: `${PATH_ROOT}/${app.slug}`,
      comingSoon: true,
    })),
  ];
}

/** The canonical address of a hub page. */
export function canonicalUrl(path: string): string {
  return `${SITE_ORIGIN}${path}`;
}
