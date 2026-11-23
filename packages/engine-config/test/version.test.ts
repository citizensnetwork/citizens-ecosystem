import { describe, expect, it } from 'vitest';
import {
  CONTRACT_MAJOR,
  CONTRACT_MINOR,
  CONTRACT_VERSION,
  checkContractVersion,
  parseContractVersion,
  UPGRADE_STEPS,
  upgradeDocument,
  type UpgradeStep,
} from '../src/index';

describe('contract version', () => {
  it('is 1.0, with nothing older to upgrade from', () => {
    expect(CONTRACT_VERSION).toBe('1.0');
    expect([CONTRACT_MAJOR, CONTRACT_MINOR]).toEqual([1, 0]);
    expect(UPGRADE_STEPS.size).toBe(0);
  });

  it('parses only a plain "major.minor"', () => {
    expect(parseContractVersion('1.0')).toEqual({ major: 1, minor: 0 });
    expect(parseContractVersion('12.34')).toEqual({ major: 12, minor: 34 });
    for (const bad of [
      '1',
      '1.0.0',
      '01.0',
      '1.00',
      'v1.0',
      ' 1.0',
      '1.0\n',
      '',
      1,
      null,
      undefined,
      {},
    ]) {
      expect(parseContractVersion(bad), String(bad)).toBeNull();
    }
  });

  it('reads its own major at its own minor or lower', () => {
    const engine = { major: 2, minor: 3 };
    expect(checkContractVersion('2.3', engine)).toEqual({
      ok: true,
      version: { major: 2, minor: 3 },
    });
    expect(checkContractVersion('2.0', engine).ok).toBe(true);
    expect(checkContractVersion(CONTRACT_VERSION).ok).toBe(true);
  });

  it('refuses a newer minor, a newer major, an older major and a malformed version', () => {
    const engine = { major: 2, minor: 3 };
    const reason = (value: unknown) => {
      const check = checkContractVersion(value, engine);
      return check.ok ? 'ok' : check.reason;
    };
    expect(reason('2.4')).toBe('newer-minor');
    expect(reason('3.0')).toBe('newer-major');
    expect(reason('1.9')).toBe('older-major');
    expect(reason('two')).toBe('malformed');
    expect(reason(undefined)).toBe('malformed');
    const older = checkContractVersion('1.9', engine);
    expect(older.ok ? '' : older.message).toContain('Upgrade the document first');
  });
});

describe('upgradeDocument', () => {
  const addField: UpgradeStep = (document) => ({ ...document, added: true });
  const renameField: UpgradeStep = ({ added, ...rest }) => ({ ...rest, renamed: added });

  it('returns a document at the current major as it is, in a new object', () => {
    const document = { contract: '1.0', revision: 4 };
    const result = upgradeDocument(document);
    expect(result).toEqual({ ok: true, document, applied: 0 });
    expect(result.ok && result.document).not.toBe(document);
  });

  it('applies each step in turn and stamps the new major', () => {
    const document = { contract: '1.7', revision: 4 };
    const steps = new Map([
      [1, addField],
      [2, renameField],
    ]);
    expect(upgradeDocument(document, { steps, targetMajor: 2 })).toEqual({
      ok: true,
      document: { contract: '2.0', revision: 4, added: true },
      applied: 1,
    });
    expect(upgradeDocument(document, { steps, targetMajor: 3 })).toEqual({
      ok: true,
      document: { contract: '3.0', revision: 4, renamed: true },
      applied: 2,
    });
    expect(document).toEqual({ contract: '1.7', revision: 4 });
  });

  it('a step cannot choose the version it lands on', () => {
    const liar: UpgradeStep = (document) => ({ ...document, contract: '9.9' });
    const result = upgradeDocument(
      { contract: '1.0' },
      { steps: new Map([[1, liar]]), targetMajor: 2 },
    );
    expect(result.ok && result.document.contract).toBe('2.0');
  });

  it('fails without a step, for a newer major, and for anything that is not a document', () => {
    const reason = (document: unknown, options?: Parameters<typeof upgradeDocument>[1]) => {
      const result = upgradeDocument(document, options);
      return result.ok ? 'ok' : result.reason;
    };
    expect(reason({ contract: '1.0' }, { targetMajor: 2 })).toBe('no-upgrade-path');
    expect(reason({ contract: '2.0' })).toBe('newer-major');
    expect(reason({ contract: 'x' })).toBe('malformed');
    expect(reason({})).toBe('malformed');
    expect(reason(null)).toBe('not-a-document');
    expect(reason('1.0')).toBe('not-a-document');
    expect(reason([{ contract: '1.0' }])).toBe('not-a-document');
  });
});
