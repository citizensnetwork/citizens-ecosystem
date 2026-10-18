/**
 * The WebP crop helper (Designer build, phase 3). The encoder needs a real browser, which the unit-test job does not
 * have, so only its pure parts are pinned here; the real encode was run by hand against a Chromium screenshot and its
 * output is read back through the same reader the card validator uses (see the pull request's record).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  DEFAULT_MAX_CHARS,
  DEFAULT_MAX_WIDTH,
  isScratchPath,
  parseCrop,
  positiveInt,
} from '../../../scripts/design/image-webp.mjs';

describe('parseCrop', () => {
  it('reads x,y,w,h as whole numbers', () => {
    expect(parseCrop('10,20,300,150')).toEqual({ x: 10, y: 20, w: 300, h: 150 });
    expect(parseCrop(' 0, 0, 16, 16 ')).toEqual({ x: 0, y: 0, w: 16, h: 16 });
  });
  it.each([
    '',
    '1,2,3',
    '1,2,3,4,5',
    'a,b,c,d',
    '1,2,0,4',
    '1,2,3,0',
    '-1,2,3,4',
    '1.5,2,3,4',
    '0,0,15,200',
    '0,0,200,15',
  ])('rejects %j', (text) => {
    expect(() => parseCrop(text)).toThrow(/--crop/);
  });
});

describe('isScratchPath', () => {
  it('accepts a file under a .claude/design folder, in either slash style', () => {
    expect(isScratchPath('C:/repo/.claude/design/cards/a.txt')).toBe(true);
    expect(isScratchPath('C:\\repo\\.claude\\design\\captures\\2026-10-18\\a.txt')).toBe(true);
    expect(isScratchPath('/home/x/repo/.claude/design/a.txt')).toBe(true);
  });
  it('refuses anything else, including a look-alike and a path that climbs out', () => {
    expect(isScratchPath('C:/repo/docs/design/STYLE.md')).toBe(false);
    expect(isScratchPath('C:/repo/.claude/designs/a.txt')).toBe(false);
    expect(isScratchPath('a.txt')).toBe(false);
    expect(isScratchPath('/home/x/repo/.claude/design/../../docs/design/STYLE.md')).toBe(false);
  });
});

describe('positiveInt', () => {
  it('reads a whole number, and passes an absent option through', () => {
    expect(positiveInt('--max-width', '480')).toBe(480);
    expect(positiveInt('--max-width', undefined)).toBeUndefined();
  });
  it.each(['0', '-3', '1.5', 'abc', '', '99999999'])('rejects %j', (text) => {
    expect(() => positiveInt('--max-chars', text)).toThrow(/--max-chars/);
  });
});

describe('defaults', () => {
  it('match the refImage cap of designer.md section 5 (40 KB of data: string) and a phone-sized crop', () => {
    expect(DEFAULT_MAX_CHARS).toBe(40 * 1024);
    expect(DEFAULT_MAX_WIDTH).toBe(480);
  });
});

describe('the command line', () => {
  it('prints its usage and exits 2 when the image or --out is missing', () => {
    const script = join(__dirname, '..', '..', '..', 'scripts', 'design', 'image-webp.mjs');
    const r = spawnSync(process.execPath, [script, 'picture.png'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage:');
  }, 30_000);
});
