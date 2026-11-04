import { APP_SLUGS, COMING_SOON, PATH_ROOT, SITE_ORIGIN } from '@citizens/ecosystem';
import type { AppSlug } from '@citizens/ecosystem';

/**
 * Every word the front door shows, in one file, so the founder reviews one place.
 *
 * Where each piece of wording comes from:
 *  - "Conversation": the founder's website-revision conversation of 4 November 2026 (sections 5.0 to 5.5 are the
 *    proposed site copy, section 3 and 7 the Connect / Impact / Vision relationship), approved by the founder with two
 *    corrections: Vision does not find needs (it only serves the contributing organisations), and "Suggest a Need" is
 *    the Kingdom Projects feature Connect already has.
 *  - "Design": the founder's screenshot of the new landing page (the tile verb pairs are drawn from the triples).
 *  - "VISION.md": apps/connect/VISION.md (the slogan, the Scripture, the language list).
 *  - "Registry": packages/ecosystem (the coming-soon names and one-liners the founder approved on 2026-11-01).
 *  - "Code": a fact checked against Connect's code, so that nothing here says a feature is live when it is not.
 */

export const SLOGAN = 'Connecting the Kingdom';

export const SITE_NAME = 'Citizens';

/** The hub's own pages (besides the landing page). hub-config.js lists the same paths for the sitemap; a test compares them. */
export const PAGES = {
  ecosystem: `${PATH_ROOT}/ecosystem`,
  howItWorks: `${PATH_ROOT}/how-it-works`,
  philosophy: `${PATH_ROOT}/philosophy`,
  getInvolved: `${PATH_ROOT}/get-involved`,
} as const;

/** Where Connect's own screens live under the shared domain (app-relative paths from Connect's routes.jsx). */
export const CONNECT = {
  home: `${PATH_ROOT}/connect`,
  search: `${PATH_ROOT}/connect/discover`,
  kingdomProjects: `${PATH_ROOT}/connect/community`,
  lets: `${PATH_ROOT}/connect/lets`,
  apply: `${PATH_ROOT}/connect/apply`,
} as const;

/* ------------------------------------------------------------------------------------------------------------------
 * The landing page
 * ---------------------------------------------------------------------------------------------------------------- */

/** The page <title> and description of the landing page (Conversation 5.0). */
export const LANDING_TITLE = `${SITE_NAME}: ${SLOGAN}`;
export const LANDING_DESCRIPTION =
  'Citizens is an interconnected Kingdom environment built on identity, connection and belonging. Discover. Participate. Belong.';

/** The hero (Design for the layout; Conversation 5.0 for the words). */
export const HERO = {
  headline: `${SLOGAN}.`,
  verbs: 'Discover. Participate. Belong.',
  primaryCta: 'Explore the Ecosystem',
  secondaryCta: 'Get Involved',
};

/**
 * A real photograph for the hero (the design shows a smiling Citizen in front of a crowd). None is shipped yet: the
 * founder supplies community photography (with consent), a file goes in public/ and this becomes `{ src, alt }`.
 * Until then the hero shows its drawn art. The same goes for `photo` on a platform card.
 */
export const HERO_PHOTO: { src: string; alt: string } | undefined = undefined;

/** What Citizens is, in three lines (Conversation 5.0). */
export const INTRO = {
  lead: 'Citizens is an interconnected Kingdom environment built on identity, connection and belonging.',
  body: 'We bring people, churches, ministries, organisations, businesses and communities together through shared opportunities, resources and experiences.',
  belief:
    'We believe every Citizen has value, every contribution matters, and every person has a part to play.',
};

/** The heading above the tiles (Conversation 5.1). */
export const ECOSYSTEM_HEADING = 'The Citizens Ecosystem';
export const ECOSYSTEM_SUB = 'Different experiences. One connected purpose.';
export const ECOSYSTEM_INTRO =
  'Citizens brings together a collection of interconnected platforms, each serving a different purpose while contributing towards a greater vision.';

/** The dark band under the tiles (Design). */
export const BAND = {
  title: 'An Interconnected Community',
  body: 'People, resources and opportunities, working together for lasting impact.',
  cta: 'Learn More',
};

/** The line that closes the page (Design; the Conversation's closing message ends with it). */
export const PART_TO_PLAY = 'Every Citizen has a part to play';

/** Ephesians 2:19-21, word for word as it stands in VISION.md. */
export const SCRIPTURE = {
  text: 'Now, therefore, you are no longer strangers and foreigners, but fellow citizens with the saints and members of the household of God, having been built on the foundation of the apostles and prophets, Jesus Christ Himself being the chief cornerstone, in whom the whole building, being fitted together, grows into a holy temple in the Lord',
  reference: 'Ephesians 2:19-21',
};

/* ------------------------------------------------------------------------------------------------------------------
 * The platforms
 * ---------------------------------------------------------------------------------------------------------------- */

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

export const COMING_SOON_BADGE = 'Coming soon';
export const COMING_SOON_NOTE = 'This part of Citizens is not built yet.';
export const BACK_TO_ECOSYSTEM = 'Back to the Citizens ecosystem';

/** How a platform takes part in "How it works". `platforms` are registry slugs. */
export const HOW = {
  title: 'How it works',
  description:
    'One ecosystem, many ways to make a difference: how Connect, Vision, Impact and the other Citizens platforms work together.',
  heading: 'One ecosystem. Many ways to make a difference.',
  intro:
    'The Citizens platforms are designed to work together, creating opportunities that extend beyond individual applications.',
  steps: [
    {
      n: '01',
      name: 'Discover',
      platforms: ['connect'],
      text: 'Connect provides a shared environment where people and organisations can discover activities, opportunities and community needs. Anyone can contribute by suggesting, identifying or sharing something that deserves attention.',
    },
    {
      n: '02',
      name: 'Organise',
      platforms: ['vision'],
      text: 'Organisations use Vision to manage their activities, coordinate projects, monitor progress and understand their reach and effectiveness.',
    },
    {
      n: '03',
      name: 'Collaborate',
      platforms: ['impact'],
      text: 'Impact brings the right people, businesses and organisations together to mobilise resources, skills, funding and support.',
    },
    {
      n: '04',
      name: 'Participate',
      platforms: ['connect', 'play', 'move', 'wear', 'learn'],
      text: 'Through Connect, Play, Move, Wear and Learn, people can become involved, develop their abilities and contribute in different ways.',
    },
    {
      n: '05',
      name: 'Measure and Grow',
      platforms: ['vision'],
      text: 'Vision helps organisations understand their progress and impact, providing insight that can inform future initiatives and strengthen collaboration.',
    },
  ],
  outro:
    'Together, these platforms create an environment where discovery can lead to participation, collaboration can lead to action, and action can create lasting change.',
  /** Conversation 7, in the founder's words: who does what, and that it is not a fixed sequence. */
  roles: {
    heading: 'Who does what',
    rows: [
      {
        slug: 'connect',
        role: 'Public discovery, community needs, suggestions and participation.',
      },
      {
        slug: 'impact',
        role: 'Collaboration, resource mobilisation and coordinated community initiatives.',
      },
      {
        slug: 'vision',
        role: 'Internal organisational management, monitoring, intelligence and impact measurement.',
      },
    ],
    note: 'This is how the parts relate, not a fixed sequence. Vision supports organisations throughout.',
  },
};

/** The platforms' steps in "How it works", as "01 Discover" labels, for the ecosystem page. */
export function stepsFor(slug: string): string[] {
  return HOW.steps
    .filter((step) => step.platforms.includes(slug))
    .map((step) => `${step.n} ${step.name}`);
}

export interface PlatformCopy {
  /** The two verbs on the tile (Design). */
  tileVerbs: string;
  /** The three verbs of the platform (Conversation 5.1). */
  verbs: readonly [string, string, string];
  /** One or two sentences of purpose, shown when a tile is hovered or focused (Conversation 2, suggested descriptions). */
  tagline: string;
  /** The platform's description (Conversation 5.1). */
  description: string;
  /** What a person can do today. Built apps only, and only what the code does today (Code). */
  today?: readonly string[];
}

/** Keyed by registry slug. A test keeps this in step with APP_SLUGS and COMING_SOON. */
export const PLATFORM_COPY: Record<string, PlatformCopy> = {
  connect: {
    tileVerbs: 'Discover & Participate',
    verbs: ['Discover', 'Participate', 'Belong'],
    tagline:
      "Connecting people to places, opportunities, events and communities. Discover what's happening, find where you belong, participate and build lasting connections.",
    description:
      "Find people, places, events, communities and opportunities. Discover what's happening around you, identify needs, share opportunities and become part of something meaningful. Connect makes participation easier and brings people and communities closer together.",
    today: [
      'Explore a map of Christian activity: events, places and contributors near you.',
      'Follow contributors, message them, and say you are going to an event or considering it.',
      "Start or join a gathering with Let's…",
      'Suggest a need through Kingdom Projects, and rally people to meet it.',
      'Apply to list your organisation, so the people looking for you can find you.',
    ],
  },
  vision: {
    tileVerbs: 'Understand & Measure',
    verbs: ['Understand', 'Coordinate', 'Measure'],
    tagline:
      'Organisational intelligence and impact management. Helping organisations understand their activities, reach, engagement and contribution to the communities they serve.',
    description:
      'An organisational intelligence environment designed to help churches, ministries and organisations understand their activities, coordinate their initiatives and measure their impact. Vision provides the internal tools and insights that help organisations manage their contribution and make informed decisions.',
    today: [
      'Track your projects, activities and goals across your departments.',
      'See where your activity happens, on a map and a timeline.',
      'Read plain-language observations and advisories, with the evidence behind each one.',
    ],
  },
  wear: {
    tileVerbs: 'Express & Collaborate',
    verbs: ['Express', 'Create', 'Collaborate'],
    tagline:
      'A collaborative marketplace for Kingdom-aligned brands. Connecting ethical fashion, creative expression and businesses through shared opportunities and meaningful community contribution.',
    description:
      'A collaborative marketplace connecting Kingdom-aligned clothing brands, designers and customers. Beyond fashion, Wear creates opportunities for brands to collaborate, support community initiatives and demonstrate how commercial success and meaningful contribution can work together.',
    today: [
      'Follow Kingdom-aligned brands and share posts and stories.',
      'Propose a design Concept for a brand to take up.',
    ],
  },
  learn: {
    tileVerbs: 'Develop & Equip',
    verbs: ['Develop', 'Equip', 'Grow'],
    tagline:
      'Connecting people to education, practical skills, training, mentorship and opportunities for personal and professional development.',
    description:
      'Connect with learning opportunities, practical skills development, education, mentorship and training. Learn helps people discover opportunities to develop their abilities, strengthen their confidence and become equipped to contribute meaningfully.',
  },
  play: {
    tileVerbs: 'Engage & Connect',
    verbs: ['Engage', 'Experience', 'Connect'],
    tagline:
      'Interactive tools, games and shared digital spaces that bring people together, encourage participation and preserve memories at gatherings and events.',
    description:
      'Making gatherings more interactive, memorable and engaging. Play provides games, icebreakers, activities and shared digital spaces where people can participate, interact and create memories together.',
  },
  move: {
    tileVerbs: 'Experience & Participate',
    verbs: ['Experience', 'Participate', 'Thrive'],
    tagline:
      'Connecting individuals and families through physical activities, recreational events and shared experiences that encourage active community participation.',
    description:
      'Connecting people through physical activities, recreational experiences and shared adventures. From community runs and hikes to sporting events and outdoor activities, Move encourages active lifestyles and meaningful connections.',
  },
  impact: {
    tileVerbs: 'Collaborate & Transform',
    verbs: ['Collaborate', 'Contribute', 'Transform'],
    tagline:
      'Bringing organisations, businesses, communities and contributors together to identify needs, develop solutions, mobilise resources and deliver measurable community change.',
    description:
      'Bringing businesses, organisations, NGOs, churches and individuals together to address community needs. Impact creates opportunities to identify challenges, develop solutions, mobilise resources and turn collaborative efforts into measurable change.',
  },
};

/**
 * Citizens Impact grows out of Kingdom Projects, which Connect already has. The progression is the Conversation's
 * (Proposed, Agreed, Funded, Launched); `today` says which steps Kingdom Projects does now (Code): a need is
 * suggested, people agree by voting to collaborate, and a project lead launches it with a kickoff event. Funding is
 * what Impact adds.
 */
export const IMPACT_PROGRESSION = {
  heading: 'From a need to a launch',
  /** Said instead of COMING_SOON_NOTE on the Impact page: it is not true that nothing of Impact exists. */
  note: 'Impact itself is not built yet. Its first steps already work, in Connect.',
  intro:
    'Impact begins where Connect already does: with a need someone has seen. Kingdom Projects, in Connect, does the first steps today.',
  steps: [
    { name: 'Proposed', text: 'A need is suggested.', today: true },
    { name: 'Agreed', text: 'Enough people agree to collaborate.', today: true },
    {
      name: 'Funded',
      text: 'Funding and other support are mobilised: equipment, expertise, manpower, facilities and network access.',
      today: false,
    },
    { name: 'Launched', text: 'The project officially begins, with a kickoff.', today: true },
  ],
  todayTag: 'Works today in Kingdom Projects',
  laterTag: 'Comes with Impact',
  cta: 'Suggest a need in Kingdom Projects',
};

export interface AppCard {
  slug: string;
  /** "Citizens Connect" */
  label: string;
  /** "Connect" */
  short: string;
  href: string;
  comingSoon: boolean;
  /** The registry's or the built-app one-liner. */
  summary: string;
  tileVerbs: string;
  verbs: readonly [string, string, string];
  tagline: string;
  description: string;
  today: readonly string[];
  /** Where it takes part in "How it works". */
  fits: string[];
  /** A real photograph for the tile, once the founder supplies one (none yet: the tile shows its drawn art). */
  photo?: { src: string; alt: string };
}

function copyFor(slug: string): PlatformCopy {
  const copy = PLATFORM_COPY[slug];
  if (!copy) throw new Error(`content.ts has no PLATFORM_COPY for the app "${slug}"`);
  return copy;
}

function toCard(slug: string, label: string, summary: string, comingSoon: boolean): AppCard {
  const copy = copyFor(slug);
  return {
    slug,
    label,
    short: label.replace(/^Citizens\s+/, ''),
    href: `${PATH_ROOT}/${slug}`,
    comingSoon,
    summary,
    tileVerbs: copy.tileVerbs,
    verbs: copy.verbs,
    tagline: copy.tagline,
    description: copy.description,
    today: copy.today ?? [],
    fits: stepsFor(slug),
  };
}

/** The tiles and the ecosystem page: the built apps first (registry order), then the coming-soon ones. */
export function appCards(): AppCard[] {
  return [
    ...APP_SLUGS.map((slug) =>
      toCard(slug, BUILT_APPS[slug].label, BUILT_APPS[slug].summary, false),
    ),
    ...COMING_SOON.map((app) => toCard(app.slug, app.label, app.summary, true)),
  ];
}

/* ------------------------------------------------------------------------------------------------------------------
 * Kingdom Projects: "Suggest a need" (Conversation 7, as the founder corrected it; the steps are what the code does)
 * ---------------------------------------------------------------------------------------------------------------- */

export const KINGDOM_PROJECTS = {
  heading: 'Suggest a need: Kingdom Projects',
  lead: 'Connect is where community needs become visible, and Kingdom Projects is how they get there. Anyone can suggest something that deserves attention, and others can rally around it.',
  steps: [
    {
      name: 'Suggest a need',
      text: 'A signed-in citizen describes the need, the vision, and what working together would look like. Anyone can read the board.',
    },
    {
      name: 'Rally',
      text: 'People vote to collaborate. The author picks a tier, from a small volunteer group (up to 20 votes) to a provincial vision (10,000 votes), and a goal to match. While it gathers votes, it also shows on the Discover map.',
    },
    {
      name: 'Launch',
      text: 'When the goal is reached the idea becomes a Kingdom Project and everyone who voted is told. Whoever suggested it leads it: they choose a real date for the kickoff, and the voters are connected to it.',
    },
    {
      name: 'Confirm and grow',
      text: 'Larger ideas are reviewed by an admin when they reach their goal, and an admin confirms each project. This is the road Citizens Impact will widen: proposed, agreed, funded and officially launched, with organisations beside the community.',
    },
  ],
  closing:
    'It gives Citizens a community intelligence of its own: the community itself says where help is needed. Vision stays the internal workspace organisations use to manage their response.',
  cta: 'Open Kingdom Projects',
};

/* ------------------------------------------------------------------------------------------------------------------
 * Our philosophy (Conversation 5.3 and 5.5; "Words we use" from VISION.md's Language section)
 * ---------------------------------------------------------------------------------------------------------------- */

export const PHILOSOPHY = {
  title: 'Our philosophy',
  description:
    'A Kingdom built together: why Citizens exists, what it believes, and the words it uses.',
  heading: 'A Kingdom built together.',
  lead: 'Citizens is founded on a simple conviction: we were never meant to build independently of one another.',
  body: 'Our differences, abilities, resources and opportunities are not reasons for separation. They are opportunities for contribution.',
  beliefs: [
    'Every person has inherent value.',
    'Every individual has something meaningful to contribute.',
    'Connection creates opportunities that isolation cannot.',
    'Collaboration allows resources and abilities to go further.',
    'Sustainable change requires people and organisations to work together.',
  ],
  notAnother:
    'Citizens is not about creating another exclusive community or replacing the work already being done. It is about connecting what already exists, strengthening relationships and creating opportunities for greater collective impact.',
  notAllSame:
    "We don't all have to do the same thing. We simply need to recognise how our individual contributions fit together.",
  foundation: {
    heading: 'Our foundation: Ephesians 2:19–22',
    text: "We are members of God's household, being built together into a dwelling place for Him. Every part has a place. Every part contributes to the whole.",
  },
  closing: {
    heading: 'Stronger together.',
    paragraphs: [
      'Citizens is an opportunity to see beyond what we can achieve independently.',
      'To recognise the value in others, connect what is already available and create opportunities that benefit the communities around us.',
      'We believe that when people find their place, organisations find one another, and resources are shared with purpose, something greater becomes possible.',
    ],
  },
  words: {
    heading: 'Words we use',
    items: [
      {
        term: 'Kingdom',
        text: 'The entire inclusive Christian ecosystem, including people, organisations, initiatives, principles, beliefs and activity.',
      },
      {
        term: 'Body',
        text: 'Another reference to the Christian community, with an added emphasis on the collaborative nature between its many functional pieces.',
      },
      {
        term: 'Citizens',
        text: "Every Christian person, whether part of an organisation or not. Every Christian believer is first a citizen and a child in God's Kingdom.",
      },
      {
        term: 'Contributors',
        text: 'Christian and faith-rooted organisations, whether companies, non-profits, marketplaces or any formal help, and the people who are actively helping, serving and adding to Christian activity.',
      },
    ],
  },
};

/* ------------------------------------------------------------------------------------------------------------------
 * Get involved (Conversation 5.4). The links are the real doors that exist today (Code).
 * ---------------------------------------------------------------------------------------------------------------- */

export interface Door {
  label: string;
  href: string;
}

export interface Audience {
  id: string;
  name: string;
  text: string;
  doors: readonly Door[];
}

export const GET_INVOLVED = {
  title: 'Get involved',
  description:
    "There's a place for everyone: how individuals, churches, businesses, organisations and educators can take part in Citizens.",
  heading: "There's a place for everyone.",
  intro:
    'Citizens creates opportunities for individuals and organisations to participate according to their abilities, resources and interests.',
  audiences: [
    {
      id: 'individuals',
      name: 'Individuals',
      text: 'Discover communities, events, opportunities and experiences. Share ideas, develop skills and find meaningful ways to contribute.',
      doors: [
        { label: 'Find your place', href: CONNECT.home },
        { label: 'Suggest a need', href: CONNECT.kingdomProjects },
        { label: 'Gather people', href: CONNECT.lets },
      ],
    },
    {
      id: 'churches-and-ministries',
      name: 'Churches and Ministries',
      text: 'Connect with other ministries, share initiatives, discover resources and strengthen collaboration across the Kingdom.',
      doors: [
        { label: 'List your church or ministry', href: CONNECT.apply },
        { label: 'Understand your impact', href: `${PATH_ROOT}/vision` },
      ],
    },
    {
      id: 'businesses-and-brands',
      name: 'Businesses and Brands',
      text: 'Build relationships, collaborate with other businesses and contribute skills, products, resources and expertise towards meaningful initiatives.',
      doors: [
        { label: 'List your business', href: CONNECT.apply },
        { label: 'Bring your brand to Wear', href: `${PATH_ROOT}/wear` },
      ],
    },
    {
      id: 'ngos-and-community-organisations',
      name: 'NGOs and Community Organisations',
      text: 'Make your work visible, identify collaborative opportunities, mobilise support and connect with people who share your objectives.',
      doors: [
        { label: 'List your organisation', href: CONNECT.apply },
        { label: 'About Citizens Impact', href: `${PATH_ROOT}/impact` },
      ],
    },
    {
      id: 'educators-and-development-partners',
      name: 'Educators and Development Partners',
      text: 'Share learning opportunities, equip people with practical skills and contribute towards personal, professional and community development.',
      doors: [
        { label: 'List your institution', href: CONNECT.apply },
        { label: 'About Citizens Learn', href: `${PATH_ROOT}/learn` },
      ],
    },
  ] satisfies readonly Audience[],
  closing: 'Your contribution matters. Find where you fit.',
  ctaPrimary: 'Explore Citizens',
  ctaSecondary: 'Become Involved',
};

/* ------------------------------------------------------------------------------------------------------------------
 * The ecosystem page
 * ---------------------------------------------------------------------------------------------------------------- */

export const ECOSYSTEM_PAGE = {
  title: 'The Citizens ecosystem',
  description:
    'Connect, Vision, Wear, Learn, Play, Move and Impact: different experiences, one connected purpose.',
  todayHeading: 'What you can do today',
  planHeading: 'The plan',
  fitsHeading: 'Where it fits',
  fitsLink: 'How it works',
  open: 'Open',
  about: 'About',
};

/* ------------------------------------------------------------------------------------------------------------------
 * Navigation (Design: Explore, Get Involved, About, search, Join; Conversation 6 for the pages they lead to)
 * ---------------------------------------------------------------------------------------------------------------- */

export interface NavGroup {
  id: string;
  label: string;
  links: readonly Door[];
}

/** The three drop-downs. Every link goes to another page, so an open menu never covers the page it points at. */
export function navGroups(): NavGroup[] {
  return [
    {
      id: 'explore',
      label: 'Explore',
      links: [
        { label: 'The ecosystem', href: PAGES.ecosystem },
        ...appCards().map((card) => ({ label: card.label, href: card.href })),
      ],
    },
    {
      id: 'involved',
      label: 'Get involved',
      links: GET_INVOLVED.audiences.map((audience) => ({
        label: audience.name,
        href: `${PAGES.getInvolved}#${audience.id}`,
      })),
    },
    {
      id: 'about',
      label: 'About',
      links: [
        { label: HOW.title, href: PAGES.howItWorks },
        { label: PHILOSOPHY.title, href: PAGES.philosophy },
      ],
    },
  ];
}

export const SEARCH = { label: 'Search the Kingdom', href: CONNECT.search };
export const JOIN = { label: 'Join', href: CONNECT.home };

/* ------------------------------------------------------------------------------------------------------------------
 * The other pages
 * ---------------------------------------------------------------------------------------------------------------- */

export const NOT_FOUND_TITLE = 'Page not found';
export const NOT_FOUND_BODY = 'This address is not part of Citizens.';

/** The <title> of an inner page: "How it works: Citizens". */
export function pageTitle(name: string): string {
  return `${name}: ${SITE_NAME}`;
}

/** The canonical address of a hub page. */
export function canonicalUrl(path: string): string {
  return `${SITE_ORIGIN}${path}`;
}
