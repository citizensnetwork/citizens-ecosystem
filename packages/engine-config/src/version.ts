/**
 * Versioning rules of the configuration contract.
 *
 * Every entitlements document and every configuration document carries `contract`, a
 * "major.minor" string naming the contract version it was written for.
 *
 * - A MINOR step only adds: a new optional field, a new feature switch (off unless switched
 *   on), a new term or message that has an engine default, a new theme token with a default.
 *   A document written for an older minor of the same major is still valid as it stands.
 * - A MAJOR step is anything else: a field removed or renamed, a meaning changed, a new field
 *   with no default, a rule made stricter so that a valid document could become invalid. Each
 *   major step ships one pure upgrade function in `UPGRADE_STEPS`, so a stored document can be
 *   carried forward without a person editing it.
 * - An engine build reads its own major, at its own minor or lower. It refuses a document from
 *   a newer minor or a newer major (the world would silently ignore settings its code does not
 *   know), and it refuses an older major until `upgradeDocument` has carried it forward.
 *
 * A configuration also carries `revision`: a whole number the tenant's project raises by one
 * each time a configuration is published. The contract version says which rules a document
 * follows; the revision says which edition of the tenant's choices it is.
 */

export const CONTRACT_MAJOR = 1;
export const CONTRACT_MINOR = 0;
export const CONTRACT_VERSION = `${CONTRACT_MAJOR}.${CONTRACT_MINOR}`;

export interface ContractVersion {
  readonly major: number;
  readonly minor: number;
}

const VERSION_RE = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

/** "1.0" -> { major: 1, minor: 0 }. Null for anything that is not a plain "major.minor". */
export function parseContractVersion(value: unknown): ContractVersion | null {
  if (typeof value !== 'string') return null;
  const match = VERSION_RE.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

export type ContractCompatibility =
  | { readonly ok: true; readonly version: ContractVersion }
  | {
      readonly ok: false;
      readonly reason: 'malformed' | 'older-major' | 'newer-major' | 'newer-minor';
      readonly message: string;
    };

/** Can this engine build read a document that says it follows `value`? */
export function checkContractVersion(
  value: unknown,
  engine: ContractVersion = { major: CONTRACT_MAJOR, minor: CONTRACT_MINOR },
): ContractCompatibility {
  const version = parseContractVersion(value);
  const engineText = `${engine.major}.${engine.minor}`;
  if (!version) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'The contract version must look like "1.0".',
    };
  }
  if (version.major < engine.major) {
    return {
      ok: false,
      reason: 'older-major',
      message: `This document follows contract ${value}; the engine is at ${engineText}. Upgrade the document first.`,
    };
  }
  if (version.major > engine.major) {
    return {
      ok: false,
      reason: 'newer-major',
      message: `This document follows contract ${value}; the engine only reads up to ${engineText}.`,
    };
  }
  if (version.minor > engine.minor) {
    return {
      ok: false,
      reason: 'newer-minor',
      message: `This document follows contract ${value}; the engine only reads up to ${engineText}.`,
    };
  }
  return { ok: true, version };
}

/** Carries a stored document from one major to the next. Pure: it returns a new object. */
export type UpgradeStep = (document: Readonly<Record<string, unknown>>) => Record<string, unknown>;

/**
 * The upgrade steps, keyed by the major they start from. Empty while the contract is at
 * major 1: there is nothing older to carry forward.
 */
export const UPGRADE_STEPS: ReadonlyMap<number, UpgradeStep> = new Map();

export type UpgradeResult =
  | { readonly ok: true; readonly document: Record<string, unknown>; readonly applied: number }
  | {
      readonly ok: false;
      readonly reason: 'not-a-document' | 'malformed' | 'newer-major' | 'no-upgrade-path';
      readonly message: string;
    };

/**
 * Carries a stored document forward to this engine's major, one step at a time. A document
 * already at this major is returned as it is (an older minor needs no change). The result
 * still has to pass validation: an upgrade changes shape, it does not vouch for content.
 */
export function upgradeDocument(
  document: unknown,
  options: {
    readonly steps?: ReadonlyMap<number, UpgradeStep>;
    readonly targetMajor?: number;
  } = {},
): UpgradeResult {
  const steps = options.steps ?? UPGRADE_STEPS;
  const targetMajor = options.targetMajor ?? CONTRACT_MAJOR;
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    return { ok: false, reason: 'not-a-document', message: 'A document must be an object.' };
  }
  let current: Record<string, unknown> = { ...(document as Record<string, unknown>) };
  const start = parseContractVersion(current.contract);
  if (!start) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'The contract version must look like "1.0".',
    };
  }
  if (start.major > targetMajor) {
    return {
      ok: false,
      reason: 'newer-major',
      message: `This document follows contract ${String(current.contract)}; the engine is at major ${targetMajor}.`,
    };
  }
  let applied = 0;
  for (let major = start.major; major < targetMajor; major += 1) {
    const step = steps.get(major);
    if (!step) {
      return {
        ok: false,
        reason: 'no-upgrade-path',
        message: `There is no upgrade step from contract major ${major} to ${major + 1}.`,
      };
    }
    current = { ...step(current), contract: `${major + 1}.0` };
    applied += 1;
  }
  return { ok: true, document: current, applied };
}
