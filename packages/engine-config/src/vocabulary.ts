/**
 * The vocabulary: every word a person can see, in one dictionary.
 *
 * Three parts:
 *
 * 1. TERMS are the nouns a tenant renames: what its world is called, what its users and its
 *    partners are called. A term is written the way it reads in the middle of a sentence
 *    ("member", or "Contributor" for a world that always writes it with a capital), with its
 *    plural. The capitalised forms and the article ("a" or "an") are worked out, and can be set
 *    by hand when the rule gets them wrong.
 *
 * 2. MESSAGES are the engine's sentences, each with a neutral default written with
 *    placeholders. `{partner}` is the term as written, `{partner:many}` its plural,
 *    `{partner:One}` and `{partner:Many}` the capitalised forms, `{partner:a}` and
 *    `{partner:A}` the term with its article. `{$name}` is a value filled in when the message
 *    is shown. A tenant that only sets its terms gets a complete, consistent world; it can
 *    also replace any single message with its own text.
 *
 * 3. ADDRESS WORDS are the framing words that appear in web addresses. Internal names stay
 *    (ADR-001, decision 5), so each word maps a tenant's public word to the internal one.
 *
 * Messages are plain text. Whoever shows one escapes it for the place it goes (HTML, SQL).
 */

import type { FeatureKey } from './features';

/* ── Terms ─────────────────────────────────────────────────────────── */

export type TermForm = 'one' | 'many' | 'One' | 'Many' | 'a' | 'A';

export const TERM_FORMS: readonly TermForm[] = ['one', 'many', 'One', 'Many', 'a', 'A'];

/** The forms a NAME can take: a name has no plural and no article. */
const NAME_FORMS: ReadonlySet<TermForm> = new Set<TermForm>(['one', 'One']);

export interface TermValue {
  /** The word as it reads mid-sentence: "member", "Contributor". */
  readonly one: string;
  /** Its plural. Needed for a noun, never used for a name. */
  readonly many?: string;
  /** "a" or "an", when the first-letter rule is wrong ("an hour", "a user"). */
  readonly article?: 'a' | 'an';
  /** The capitalised singular, when capitalising the first letter is wrong. */
  readonly oneCapitalised?: string;
  /** The capitalised plural, when capitalising the first letter is wrong. */
  readonly manyCapitalised?: string;
}

export interface TermDefinition {
  readonly summary: string;
  /** A 'name' is a proper name (one form). A 'noun' is counted (singular and plural). */
  readonly kind: 'name' | 'noun';
  /** The neutral default. A term without one must be set by every configuration. */
  readonly default?: TermValue;
}

export const TERMS = {
  world: { summary: 'The full name of the world, as on its title bar.', kind: 'name' },
  worldShort: { summary: 'The short name, as under a home-screen icon.', kind: 'name' },
  discovery: {
    summary: 'The name of the list of every listing.',
    kind: 'name',
    default: { one: 'Discover' },
  },
  gatherings: {
    summary: 'The name of the gatherings feature.',
    kind: 'name',
    default: { one: 'Gatherings' },
  },
  user: {
    summary: 'A person who uses the world.',
    kind: 'noun',
    default: { one: 'member', many: 'members' },
  },
  partner: {
    summary: 'An organisation or person with a managed profile (internally a "contributor").',
    kind: 'noun',
    default: { one: 'partner', many: 'partners' },
  },
  ideaProject: {
    summary: 'An idea on the ideas board that reached its goal.',
    kind: 'noun',
    default: { one: 'community project', many: 'community projects' },
  },
} as const satisfies Record<string, TermDefinition>;

export type TermKey = keyof typeof TERMS;

export const TERM_KEYS = Object.keys(TERMS) as readonly TermKey[];

/** The terms that have no default: every configuration must set them. */
export const REQUIRED_TERMS: readonly TermKey[] = TERM_KEYS.filter(
  (key) => (TERMS[key] as TermDefinition).default === undefined,
);

export type ResolvedTerms = Readonly<Record<TermKey, TermValue>>;

/** A configuration's terms laid over the engine defaults. */
export function resolveTerms(terms: Partial<Record<TermKey, TermValue>>): ResolvedTerms {
  const resolved = {} as Record<TermKey, TermValue>;
  for (const key of TERM_KEYS) {
    const own = Object.hasOwn(terms, key) ? terms[key] : undefined;
    const fallback = (TERMS[key] as TermDefinition).default;
    const value = own ?? fallback;
    if (!value) throw new Error(`The term "${key}" has no value and no default.`);
    resolved[key] = value;
  }
  return resolved;
}

function capitalise(text: string): string {
  const first = Array.from(text)[0];
  if (first === undefined) return text;
  return first.toLocaleUpperCase('en') + text.slice(first.length);
}

/** One form of a term: "partner", "partners", "Partner", "Partners", "a partner", "A partner". */
export function termForm(value: TermValue, form: TermForm): string {
  const many = value.many ?? value.one;
  switch (form) {
    case 'one':
      return value.one;
    case 'many':
      return many;
    case 'One':
      return value.oneCapitalised ?? capitalise(value.one);
    case 'Many':
      return value.manyCapitalised ?? capitalise(many);
    case 'a':
    case 'A': {
      const article = value.article ?? (/^[aeiou]/i.test(value.one) ? 'an' : 'a');
      return `${form === 'A' ? capitalise(article) : article} ${value.one}`;
    }
  }
}

/* ── Templates ─────────────────────────────────────────────────────── */

export type TemplatePart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'term'; readonly term: TermKey; readonly form: TermForm }
  | { readonly type: 'param'; readonly name: string };

export interface TemplateProblem {
  readonly code: 'malformed' | 'unknown-term' | 'bad-form' | 'unknown-param';
  readonly detail: string;
}

const TOKEN_RE = /\{([^{}]*)\}/g;
const PARAM_RE = /^\$([a-z][A-Za-z0-9]{0,39})$/;
const TERM_RE = /^([A-Za-z]{1,40})(?::([A-Za-z]{1,10}))?$/;

function isTermKey(value: string): value is TermKey {
  return Object.hasOwn(TERMS, value);
}

function isTermForm(value: string): value is TermForm {
  return (TERM_FORMS as readonly string[]).includes(value);
}

/**
 * Splits a template into text, term and value parts, and lists what is wrong with it.
 * `allowedParams` is the list of `{$name}` values the message is shown with.
 */
export function parseTemplate(
  template: string,
  allowedParams: readonly string[] = [],
): { readonly parts: readonly TemplatePart[]; readonly problems: readonly TemplateProblem[] } {
  const parts: TemplatePart[] = [];
  const problems: TemplateProblem[] = [];
  const pushText = (text: string) => {
    if (text === '') return;
    if (text.includes('{') || text.includes('}')) {
      problems.push({ code: 'malformed', detail: 'A curly bracket is not part of a placeholder.' });
    }
    parts.push({ type: 'text', text });
  };

  let last = 0;
  for (const match of template.matchAll(TOKEN_RE)) {
    const inner = match[1] ?? '';
    pushText(template.slice(last, match.index));
    last = match.index + match[0].length;

    const param = PARAM_RE.exec(inner);
    if (param) {
      const name = param[1] ?? '';
      if (!allowedParams.includes(name)) {
        problems.push({
          code: 'unknown-param',
          detail: `{$${name}} is not a value of this message.`,
        });
      }
      parts.push({ type: 'param', name });
      continue;
    }
    const term = TERM_RE.exec(inner);
    if (!term) {
      problems.push({ code: 'malformed', detail: `{${inner}} is not a placeholder.` });
      continue;
    }
    const key = term[1] ?? '';
    const form = term[2] ?? 'one';
    if (!isTermKey(key)) {
      problems.push({ code: 'unknown-term', detail: `"${key}" is not a term.` });
      continue;
    }
    if (!isTermForm(form)) {
      problems.push({ code: 'bad-form', detail: `"${form}" is not a form of a term.` });
      continue;
    }
    if (TERMS[key].kind === 'name' && !NAME_FORMS.has(form)) {
      problems.push({
        code: 'bad-form',
        detail: `"${key}" is a name: it has no plural and no article.`,
      });
      continue;
    }
    parts.push({ type: 'term', term: key, form });
  }
  pushText(template.slice(last));
  return { parts, problems };
}

export interface RenderOptions {
  /** Leave `{$name}` placeholders in the text, for a later step to fill (database wording). */
  readonly keepParams?: boolean;
}

/** Fills a parsed template. A missing value is a programming mistake, so it throws. */
export function renderParts(
  parts: readonly TemplatePart[],
  terms: ResolvedTerms,
  params: Readonly<Record<string, string | number>> = {},
  options: RenderOptions = {},
): string {
  let out = '';
  for (const part of parts) {
    if (part.type === 'text') out += part.text;
    else if (part.type === 'term') out += termForm(terms[part.term], part.form);
    else if (options.keepParams) out += `{$${part.name}}`;
    else {
      if (!Object.hasOwn(params, part.name)) {
        throw new Error(`The message needs a value for {$${part.name}}.`);
      }
      out += String(params[part.name]);
    }
  }
  return out;
}

/* ── Messages ──────────────────────────────────────────────────────── */

/** Where a person meets the text. */
export type MessageChannel = 'screen' | 'email' | 'notification' | 'metadata' | 'manifest';

/**
 * Which part of the engine writes the text out:
 * 'app' the browser app, 'server' the app's own server routes, 'edge' the edge functions,
 * 'database' a function inside the database.
 */
export type MessageRenderer = 'app' | 'server' | 'edge' | 'database';

export interface MessageDefinition {
  readonly channel: MessageChannel;
  readonly renderedBy: MessageRenderer;
  /** The neutral default. It never names a tenant, Citizens or the engine. */
  readonly default: string;
  /** The `{$name}` values the message is shown with. */
  readonly params?: readonly string[];
  /** One line only: an email subject, a sender name, a title. No line break is accepted. */
  readonly singleLine?: true;
  /** The message is only used while this feature is on. */
  readonly feature?: FeatureKey;
}

export const MESSAGES = {
  /* screens */
  'screen.map.navLabel': { channel: 'screen', renderedBy: 'app', default: 'Map' },
  'screen.discover.title': { channel: 'screen', renderedBy: 'app', default: 'Discover' },
  'screen.gatherings.title': {
    channel: 'screen',
    renderedBy: 'app',
    default: '{gatherings}',
    feature: 'gatherings',
  },
  'screen.ideas.title': {
    channel: 'screen',
    renderedBy: 'app',
    default: '{ideaProject:Many}',
    feature: 'communityIdeas',
  },
  'screen.ideas.subtitle': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'Suggest a need. Rally people. Launch it together.',
    feature: 'communityIdeas',
  },
  'screen.ideas.confirmed': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'Confirmed {ideaProject}',
    feature: 'communityIdeas',
  },
  'screen.ideas.mapType': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'Idea',
    feature: 'communityIdeas',
  },
  'screen.apply.title': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'Become {partner:a}',
    feature: 'partnerApplications',
  },
  'screen.apply.intro': {
    channel: 'screen',
    renderedBy: 'app',
    default: '{partner:Many} create events and places, post updates and message {user:many}.',
    feature: 'partnerApplications',
  },
  'screen.apply.aboutTitle': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'About your organisation',
    feature: 'partnerApplications',
  },
  'screen.apply.nameLabel': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'Organisation name',
    feature: 'partnerApplications',
  },
  'screen.apply.pendingTitle': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'Your {partner} application is being reviewed',
    feature: 'partnerApplications',
  },
  'screen.apply.invite': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'Apply to become {partner:a}',
    feature: 'partnerApplications',
  },
  'screen.communityEvents.rule': {
    channel: 'screen',
    renderedBy: 'app',
    default: '{user:Many} can post one community-organised event each week.',
    feature: 'communityEvents',
  },
  'screen.portal.title': { channel: 'screen', renderedBy: 'app', default: '{partner:One} Portal' },
  'screen.claim.action': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'Claim {partner:a} listing',
    feature: 'partnerInvitations',
  },
  'screen.role.partner': { channel: 'screen', renderedBy: 'app', default: '{partner:One}' },
  'screen.role.user': { channel: 'screen', renderedBy: 'app', default: '{user:One}' },
  'screen.fallback.userName': { channel: 'screen', renderedBy: 'app', default: '{user:A}' },
  'screen.fallback.partnerName': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'Unnamed {partner}',
  },
  'screen.fallback.ownPartnerName': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'My {partner}',
  },
  'screen.loading': { channel: 'screen', renderedBy: 'app', default: 'Loading {world}' },
  'screen.wordmark.primary': { channel: 'screen', renderedBy: 'app', default: '{worldShort}' },
  'screen.wordmark.secondary': { channel: 'screen', renderedBy: 'app', default: '' },
  'screen.offline.body': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'Reconnect to load {world}.',
  },
  'screen.admin.tab.partners': { channel: 'screen', renderedBy: 'app', default: '{partner:Many}' },
  'screen.admin.tab.users': { channel: 'screen', renderedBy: 'app', default: '{user:Many}' },
  'screen.map.type.partner': { channel: 'screen', renderedBy: 'app', default: '{partner:One}' },
  'screen.listing.whereDirectory': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'in {discovery}',
  },
  'screen.listing.whereMapAndDirectory': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'on the map and in {discovery}',
  },
  'screen.settings.weeklyDigest': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'A weekly summary of activity',
  },
  'screen.cohost.invite': {
    channel: 'screen',
    renderedBy: 'app',
    default: 'Invite another {partner}.',
  },

  /* emails */
  'email.senderName': {
    channel: 'email',
    renderedBy: 'server',
    default: '{world}',
    singleLine: true,
  },
  'email.signOff': { channel: 'email', renderedBy: 'server', default: 'The {world} team' },
  'email.openApp': {
    channel: 'email',
    renderedBy: 'server',
    default: 'Open {world}',
    singleLine: true,
  },
  'email.partnerApplication.adminSubject': {
    channel: 'email',
    renderedBy: 'server',
    default: 'New {partner} application: {$name}',
    params: ['name'],
    singleLine: true,
    feature: 'partnerApplications',
  },
  'email.partnerApproved.subject': {
    channel: 'email',
    renderedBy: 'server',
    default: "You're live on {world}: {$name}",
    params: ['name'],
    singleLine: true,
  },
  'email.partnerDeclined.subject': {
    channel: 'email',
    renderedBy: 'server',
    default: 'About your {partner} application',
    singleLine: true,
    feature: 'partnerApplications',
  },
  'email.listingInvite.subject': {
    channel: 'email',
    renderedBy: 'server',
    default: 'Is {$name} your organisation?',
    params: ['name'],
    singleLine: true,
    feature: 'partnerInvitations',
  },

  /* notifications */
  'notification.nearbyRsvp': {
    channel: 'notification',
    renderedBy: 'edge',
    default: 'A few {user:many} near you just RSVPed.',
  },
  'notification.partnerApproved.title': {
    channel: 'notification',
    renderedBy: 'database',
    default: "You're live on {world}!",
    singleLine: true,
    feature: 'partnerApplications',
  },
  'notification.partnerApproved.body': {
    channel: 'notification',
    renderedBy: 'database',
    default: 'Your {partner} listing was approved. It is now on the map and in {discovery}.',
    feature: 'partnerApplications',
  },
  'notification.partnerDeclined.title': {
    channel: 'notification',
    renderedBy: 'database',
    default: 'About your {partner} application',
    singleLine: true,
    feature: 'partnerApplications',
  },
  'notification.followedPartner.fallbackName': {
    channel: 'notification',
    renderedBy: 'database',
    default: '{partner:a} you follow',
    singleLine: true,
  },
  'notification.ideaGoalReached.title': {
    channel: 'notification',
    renderedBy: 'database',
    default: '{ideaProject:One}: goal reached!',
    singleLine: true,
    feature: 'communityIdeas',
  },
  'notification.ideaLead.body': {
    channel: 'notification',
    renderedBy: 'database',
    default:
      'You are the project lead for "{$title}". Schedule the kickoff from the {ideaProject:many} board.',
    params: ['title'],
    feature: 'communityIdeas',
  },
  'notification.ideaScheduled.title': {
    channel: 'notification',
    renderedBy: 'database',
    default: '{ideaProject:One} scheduled',
    singleLine: true,
    feature: 'communityIdeas',
  },

  /* page metadata */
  'meta.title': { channel: 'metadata', renderedBy: 'app', default: '{world}', singleLine: true },
  'meta.description': { channel: 'metadata', renderedBy: 'app', default: '', singleLine: true },
  'meta.calendarProducer': {
    channel: 'metadata',
    renderedBy: 'server',
    default: '{world}',
    singleLine: true,
  },

  /* the home-screen app (web manifest) */
  'manifest.name': { channel: 'manifest', renderedBy: 'app', default: '{world}', singleLine: true },
  'manifest.shortName': {
    channel: 'manifest',
    renderedBy: 'app',
    default: '{worldShort}',
    singleLine: true,
  },
  'manifest.description': {
    channel: 'manifest',
    renderedBy: 'app',
    default: 'Discover events, places and community near you.',
    singleLine: true,
  },
} as const satisfies Record<string, MessageDefinition>;

export type MessageKey = keyof typeof MESSAGES;

export const MESSAGE_KEYS = Object.keys(MESSAGES) as readonly MessageKey[];

export function messageDefinition(key: MessageKey): MessageDefinition {
  return MESSAGES[key];
}

export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === 'string' && Object.hasOwn(MESSAGES, value);
}

/** The keys of every message one renderer writes out, for the step that wires that renderer. */
export function messageKeysRenderedBy(renderer: MessageRenderer): MessageKey[] {
  return MESSAGE_KEYS.filter((key) => messageDefinition(key).renderedBy === renderer);
}

/** The longest text a term or a message may be. */
export const MAX_TERM_LENGTH = 60;
export const MAX_MESSAGE_LENGTH = 500;

/**
 * Is this safe as plain text? No angle brackets (text is never markup) and no control
 * characters; a line break is allowed only where `multiline` is true.
 */
export function plainTextProblem(text: string, multiline: boolean): string | null {
  if (text.includes('<') || text.includes('>')) return 'Text cannot contain < or >.';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const isControl =
      code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
    if (!isControl) continue;
    if (code === 0x0a && multiline) continue;
    return multiline
      ? 'Text cannot contain control characters.'
      : 'Text must be a single line with no control characters.';
  }
  return null;
}

/* ── Address words ─────────────────────────────────────────────────── */

export interface AddressWordDefinition {
  readonly summary: string;
  /** The word in the engine's own route names. It never changes (ADR-001, decision 5). */
  readonly internal: string;
  /** The neutral word a world shows when its configuration does not choose one. */
  readonly default: string;
}

export const ADDRESS_WORDS = {
  partner: {
    summary: 'One partner, as in an address that ends in /<word>/<name>.',
    internal: 'contributor',
    default: 'partner',
  },
  partners: {
    summary: 'The list of partners, as in the staff tab /admin/<word>.',
    internal: 'contributors',
    default: 'partners',
  },
  users: {
    summary: 'The list of users, as in the staff tab /admin/<word>.',
    internal: 'citizens',
    default: 'members',
  },
  partnerApplications: {
    summary: 'Applications to become a partner, as in a staff address.',
    internal: 'contributor-applications',
    default: 'partner-applications',
  },
} as const satisfies Record<string, AddressWordDefinition>;

export type AddressWordKey = keyof typeof ADDRESS_WORDS;

export const ADDRESS_WORD_KEYS = Object.keys(ADDRESS_WORDS) as readonly AddressWordKey[];

export const ADDRESS_WORD_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const MAX_ADDRESS_WORD_LENGTH = 40;

/**
 * First words of an address the engine already owns: its screens, its staff tabs, its own
 * API folders and its static files. A tenant's address word can never be one of these, or it
 * would shadow a real route.
 */
export const RESERVED_ADDRESS_WORDS: ReadonlySet<string> = new Set([
  // screens (the app's route table)
  'discover',
  'explore',
  'lets',
  'community',
  'messages',
  'notifications',
  'settings',
  'apply',
  'onboarding',
  'dashboard',
  'admin',
  'map',
  'me',
  'e',
  'p',
  'c',
  'upgrade',
  // staff tabs
  'applications',
  'overview',
  'reports',
  'listings',
  'create',
  // server and API folders
  'api',
  'auth',
  'v1',
  'account',
  'ai-search',
  'automation',
  'avatar',
  'blocks',
  'broadcasts',
  'consider',
  'conversations',
  'convince',
  'cron',
  'events',
  'follow',
  'indemnity',
  'intake',
  'location',
  'manage',
  'media',
  'place-follow',
  'preferences',
  'push-token',
  'rsvp',
  'search',
  'shares',
  'suggestions',
  'tags',
  'team-invites',
  'terms',
  'api-keys',
  'categories',
  'pending-elevations',
  'users',
  // static files
  'app',
  'assets',
  'icons',
  'vendor',
  'public',
  'static',
  '_next',
]);

export type ResolvedAddressWords = Readonly<Record<AddressWordKey, string>>;

export function resolveAddressWords(
  words: Partial<Record<AddressWordKey, string>>,
): ResolvedAddressWords {
  const resolved = {} as Record<AddressWordKey, string>;
  for (const key of ADDRESS_WORD_KEYS) {
    const own = Object.hasOwn(words, key) ? words[key] : undefined;
    resolved[key] = own ?? ADDRESS_WORDS[key].default;
  }
  return resolved;
}
