/**
 * The seed of the engine's default wording is generated from the message catalogue. This test
 * fails when the committed migration differs from what the catalogue gives now.
 *
 * To write the file: `ENGINE_DB_WRITE=1 pnpm --filter @engine/db wording`. Only do that while
 * the migration has not been applied to any tenant; afterwards a catalogue change needs a NEW
 * migration that upserts the changed rows (the build test compares the built table with the
 * catalogue, so it tells you).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MESSAGE_KEYS, messageDefinition } from '@engine/config';
import { MIGRATIONS_DIR } from '../src/paths.ts';
import { engineWordingRows, STAND_IN_TERMS, wordingSeedSql } from '../src/wording.ts';

const SEED_FILE = resolve(MIGRATIONS_DIR, '0010_wording_seed.sql');

describe('the engine wording seed', () => {
  const sql = wordingSeedSql('0010', 'wording_seed');

  it('is the file in the baseline', () => {
    if (process.env.ENGINE_DB_WRITE === '1') writeFileSync(SEED_FILE, sql, 'utf8');
    expect(existsSync(SEED_FILE), 'run the wording command with ENGINE_DB_WRITE=1').toBe(true);
    expect(readFileSync(SEED_FILE, 'utf8').replaceAll('\r\n', '\n')).toBe(sql);
  });

  it('has one row for every message a database or edge function writes out', () => {
    const expected = MESSAGE_KEYS.filter((key) =>
      ['database', 'edge'].includes(messageDefinition(key).renderedBy),
    ).sort((a, b) => a.localeCompare(b, 'en'));
    expect(engineWordingRows().map((row) => row.key)).toEqual(expected);
    expect(expected.length).toBeGreaterThan(10);
  });

  it('fills in the terms, keeps the values, and names no world', () => {
    const rows = Object.fromEntries(engineWordingRows().map((row) => [row.key, row.text]));
    expect(rows['notification.followedPartner.fallbackName']).toBe('a partner you follow');
    expect(rows['notification.ideaLead.body']).toBe(
      'You are the project lead for "{$title}". Schedule the kickoff from the community projects board.',
    );
    expect(rows['notification.partnerApproved.title']).toBe(
      `You're live on ${STAND_IN_TERMS.world.one}!`,
    );
    for (const text of Object.values(rows)) {
      // Only {$name} values may be left; every term placeholder is resolved.
      expect(text.replaceAll(/\{\$[a-z][A-Za-z0-9]*\}/g, '')).not.toMatch(/[{}]/);
      expect(text.length).toBeLessThanOrEqual(500);
      expect(text).not.toMatch(/[<>]/);
    }
  });
});
