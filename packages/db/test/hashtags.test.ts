import { describe, expect, it } from 'vitest';
import { extractHashtags } from '../src/hashtags';

describe('extractHashtags', () => {
  it('returns an empty array for an empty or falsy body', () => {
    expect(extractHashtags('')).toEqual([]);
    expect(extractHashtags(undefined as unknown as string)).toEqual([]);
  });

  it('extracts a single hashtag', () => {
    expect(extractHashtags('Come to #worship tonight')).toEqual(['worship']);
  });

  it('lowercases and de-dupes repeated hashtags within the same body', () => {
    expect(extractHashtags('#Worship is for everyone. #worship #WORSHIP')).toEqual(['worship']);
  });

  it('extracts multiple distinct hashtags in first-seen order', () => {
    expect(extractHashtags('#worship and #outreach this #sunday')).toEqual([
      'worship',
      'outreach',
      'sunday',
    ]);
  });

  it('does not match a "#" that is part of a word, only a real leading hashtag', () => {
    // "salt#tee" — no word boundary before the #, so it's not a hashtag.
    expect(extractHashtags('salt#tee is not a hashtag, but #tea is')).toEqual(['tea']);
  });

  it('matches a hashtag at the very start of the string', () => {
    expect(extractHashtags('#firstword then text')).toEqual(['firstword']);
  });

  it('ignores a bare "#" with no following word characters', () => {
    expect(extractHashtags('just a # by itself')).toEqual([]);
  });
});
