import { describe, expect, it } from 'vitest';
import {
  ADDRESS_WORD_KEYS,
  ADDRESS_WORD_RE,
  ADDRESS_WORDS,
  isMessageKey,
  MAX_MESSAGE_LENGTH,
  MESSAGE_KEYS,
  messageDefinition,
  messageKeysRenderedBy,
  parseTemplate,
  plainTextProblem,
  renderParts,
  REQUIRED_TERMS,
  RESERVED_ADDRESS_WORDS,
  resolveAddressWords,
  resolveTerms,
  TERM_KEYS,
  termForm,
  TERMS,
  type TermDefinition,
  type TermValue,
} from '../src/index';

const terms = resolveTerms({
  world: { one: 'Quillfern Commons' },
  worldShort: { one: 'Quillfern' },
  user: { one: 'neighbour', many: 'neighbours' },
  partner: { one: 'organiser', many: 'organisers' },
});

/** Words that would tie a default to Citizens, to its faith framing or to the engine owner. */
const FRAMING =
  /citizen|kingdom|contributor|ministr|church|christ|faith|worship|219|engine|tenant/i;

describe('terms', () => {
  it('gives every form of a noun', () => {
    const partner: TermValue = { one: 'partner', many: 'partners' };
    expect(termForm(partner, 'one')).toBe('partner');
    expect(termForm(partner, 'many')).toBe('partners');
    expect(termForm(partner, 'One')).toBe('Partner');
    expect(termForm(partner, 'Many')).toBe('Partners');
    expect(termForm(partner, 'a')).toBe('a partner');
    expect(termForm(partner, 'A')).toBe('A partner');
  });

  it('picks "an" before a vowel and lets a term overrule it', () => {
    expect(termForm({ one: 'organiser', many: 'organisers' }, 'a')).toBe('an organiser');
    expect(termForm({ one: 'Organiser', many: 'Organisers' }, 'A')).toBe('An Organiser');
    expect(termForm({ one: 'user', many: 'users', article: 'a' }, 'a')).toBe('a user');
    expect(termForm({ one: 'hour', many: 'hours', article: 'an' }, 'A')).toBe('An hour');
  });

  it('keeps a term that is already capitalised, and takes a hand-set capital form', () => {
    expect(termForm({ one: 'Contributor', many: 'Contributors' }, 'one')).toBe('Contributor');
    expect(
      termForm({ one: 'eBook fan', many: 'eBook fans', oneCapitalised: 'eBook fan' }, 'One'),
    ).toBe('eBook fan');
    expect(
      termForm({ one: 'eBook fan', many: 'eBook fans', manyCapitalised: 'eBook fans' }, 'Many'),
    ).toBe('eBook fans');
    expect(termForm({ one: 'élève', many: 'élèves' }, 'One')).toBe('Élève');
    expect(termForm({ one: '' }, 'One')).toBe('');
  });

  it('a name has one form: its plural is itself', () => {
    expect(termForm({ one: 'Quillfern' }, 'many')).toBe('Quillfern');
    expect(termForm({ one: 'Quillfern' }, 'Many')).toBe('Quillfern');
  });

  it('lays a world’s terms over the defaults, and insists on the ones without a default', () => {
    expect(terms.partner.one).toBe('organiser');
    expect(terms.ideaProject).toEqual(TERMS.ideaProject.default);
    expect(REQUIRED_TERMS).toEqual(['world', 'worldShort']);
    expect(() => resolveTerms({ worldShort: { one: 'Q' } })).toThrow(/"world"/);
  });

  it('ignores inherited keys: only a term the document itself holds counts', () => {
    const inherited = Object.create({ world: { one: 'Inherited' } }) as Record<string, TermValue>;
    inherited.worldShort = { one: 'Q' };
    expect(() => resolveTerms(inherited)).toThrow(/"world"/);
  });

  it('every noun default has a plural and every name default has none', () => {
    for (const key of TERM_KEYS) {
      const definition: TermDefinition = TERMS[key];
      if (!definition.default) continue;
      expect(definition.default.many !== undefined, key).toBe(definition.kind === 'noun');
      expect(`${definition.default.one} ${definition.default.many ?? ''}`).not.toMatch(FRAMING);
    }
  });
});

describe('templates', () => {
  const render = (
    template: string,
    params?: Record<string, string | number>,
    allowed: string[] = [],
  ) => {
    const { parts, problems } = parseTemplate(template, allowed);
    expect(problems, template).toEqual([]);
    return renderParts(parts, terms, params);
  };

  it('fills terms in every form', () => {
    expect(render('Become {partner:a}')).toBe('Become an organiser');
    expect(render('{partner:Many} and {user:many} in {world}')).toBe(
      'Organisers and neighbours in Quillfern Commons',
    );
    expect(render('{user:A} of {worldShort:One}')).toBe('A neighbour of Quillfern');
    expect(render('plain text, no placeholders')).toBe('plain text, no placeholders');
    expect(render('')).toBe('');
  });

  it('fills values, and throws when one is missing', () => {
    expect(
      render('New {partner:One}: {$name} ({$count})', { name: 'Fern Shed', count: 3 }, [
        'name',
        'count',
      ]),
    ).toBe('New Organiser: Fern Shed (3)');
    const { parts } = parseTemplate('Hello {$name}', ['name']);
    expect(() => renderParts(parts, terms, {})).toThrow(/\{\$name\}/);
    expect(() => renderParts(parts, terms)).toThrow(/\{\$name\}/);
  });

  it('does not read a value from the prototype chain', () => {
    const { parts } = parseTemplate('{$toString}', ['toString']);
    expect(() => renderParts(parts, terms, {})).toThrow();
  });

  it('can leave values in place for a later step to fill', () => {
    const { parts } = parseTemplate('Lead of "{$title}" on the {ideaProject:many} board', [
      'title',
    ]);
    expect(renderParts(parts, terms, {}, { keepParams: true })).toBe(
      'Lead of "{$title}" on the community projects board',
    );
  });

  it('a value is inserted as text and is never read as a placeholder', () => {
    expect(render('Hi {$name}', { name: '{partner:Many}' }, ['name'])).toBe('Hi {partner:Many}');
  });

  it('reports what is wrong with a template', () => {
    const codes = (template: string, allowed: string[] = []) =>
      parseTemplate(template, allowed).problems.map((problem) => problem.code);
    expect(codes('{widget}')).toEqual(['unknown-term']);
    expect(codes('{partner:Plural}')).toEqual(['bad-form']);
    expect(codes('{partner:xyz}')).toEqual(['bad-form']);
    expect(codes('{world:many}')).toEqual(['bad-form']);
    expect(codes('{world:a}')).toEqual(['bad-form']);
    expect(codes('{$name}')).toEqual(['unknown-param']);
    expect(codes('{$name}', ['name'])).toEqual([]);
    expect(codes('{}')).toEqual(['malformed']);
    expect(codes('{$Name}', ['Name'])).toEqual(['malformed']);
    expect(codes('{partner many}')).toEqual(['malformed']);
    expect(codes('an open { bracket')).toEqual(['malformed']);
    expect(codes('a closing } bracket')).toEqual(['malformed']);
    expect(codes('{{partner}}')).toEqual(['malformed', 'malformed']);
    expect(codes('{constructor}')).toEqual(['unknown-term']);
    expect(codes('{__proto__}')).toEqual(['malformed']);
  });
});

describe('the message catalogue', () => {
  it('every default is a valid template in plain text, within the length limit', () => {
    for (const key of MESSAGE_KEYS) {
      const definition = messageDefinition(key);
      const { problems } = parseTemplate(definition.default, definition.params ?? []);
      expect(problems, key).toEqual([]);
      expect(plainTextProblem(definition.default, definition.singleLine !== true), key).toBeNull();
      expect(definition.default.length, key).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    }
  });

  it('no default names Citizens, its framing, the engine or its owner', () => {
    for (const key of MESSAGE_KEYS) {
      expect(messageDefinition(key).default, key).not.toMatch(FRAMING);
    }
  });

  it('every value a message declares is used by its default', () => {
    for (const key of MESSAGE_KEYS) {
      const definition = messageDefinition(key);
      for (const name of definition.params ?? []) {
        expect(definition.default, key).toContain(`{$${name}}`);
      }
    }
  });

  it('a key says where the text is seen: its first part matches its channel', () => {
    const prefix = {
      screen: 'screen',
      email: 'email',
      notification: 'notification',
      metadata: 'meta',
      manifest: 'manifest',
    };
    for (const key of MESSAGE_KEYS) {
      expect(key.split('.')[0], key).toBe(prefix[messageDefinition(key).channel]);
    }
  });

  it('covers every channel and every renderer, including text written inside the database', () => {
    const channels = new Set(MESSAGE_KEYS.map((key) => messageDefinition(key).channel));
    expect([...channels].sort()).toEqual([
      'email',
      'manifest',
      'metadata',
      'notification',
      'screen',
    ]);
    for (const renderer of ['app', 'server', 'edge', 'database'] as const) {
      expect(messageKeysRenderedBy(renderer).length, renderer).toBeGreaterThan(0);
    }
    const database = messageKeysRenderedBy('database');
    expect(database).toContain('notification.partnerApproved.title');
    expect(database).toContain('notification.ideaLead.body');
    expect(database.every((key) => messageDefinition(key).channel === 'notification')).toBe(true);
  });

  it('knows its own keys', () => {
    expect(isMessageKey('screen.loading')).toBe(true);
    expect(isMessageKey('screen.nope')).toBe(false);
    expect(isMessageKey('toString')).toBe(false);
    expect(isMessageKey(7)).toBe(false);
  });
});

describe('plain text', () => {
  it('refuses markup and control characters, and a line break where one line is wanted', () => {
    expect(plainTextProblem('Fine — café … "quoted" & ok', false)).toBeNull();
    expect(plainTextProblem('two\nlines', true)).toBeNull();
    expect(plainTextProblem('two\nlines', false)).toMatch(/single line/);
    expect(plainTextProblem('<b>bold</b>', true)).toMatch(/</);
    expect(plainTextProblem('a > b', true)).toMatch(/>/);
    for (const control of [
      '\t',
      '\r',
      '\u0000',
      '\u001b',
      '\u007f',
      '\u0085',
      '\u2028',
      '\u2029',
    ]) {
      expect(plainTextProblem(`a${control}b`, true), JSON.stringify(control)).toMatch(/control/);
    }
  });
});

describe('address words', () => {
  it('every default is a clean, free, distinct word', () => {
    const defaults = ADDRESS_WORD_KEYS.map((key) => ADDRESS_WORDS[key].default);
    for (const word of defaults) {
      expect(word).toMatch(ADDRESS_WORD_RE);
      expect(RESERVED_ADDRESS_WORDS.has(word), word).toBe(false);
      expect(word).not.toMatch(FRAMING);
    }
    expect(new Set(defaults).size).toBe(defaults.length);
  });

  it('the internal words are the engine’s own route names, and stay', () => {
    expect(ADDRESS_WORD_KEYS.map((key) => ADDRESS_WORDS[key].internal)).toEqual([
      'contributor',
      'contributors',
      'citizens',
      'contributor-applications',
    ]);
  });

  it('a world’s words are laid over the defaults', () => {
    expect(resolveAddressWords({ partners: 'hosts' })).toEqual({
      partner: 'partner',
      partners: 'hosts',
      users: 'members',
      partnerApplications: 'partner-applications',
    });
  });

  it('accepts only lower-case words joined by single hyphens', () => {
    for (const good of ['hosts', 'host-requests', 'a1', 'x-2-y'])
      expect(good).toMatch(ADDRESS_WORD_RE);
    for (const bad of [
      'Hosts',
      '-hosts',
      'hosts-',
      'ho--sts',
      'ho sts',
      'h/o',
      '1hosts',
      '',
      'hösts',
      '..',
    ]) {
      expect(bad).not.toMatch(ADDRESS_WORD_RE);
    }
  });
});
