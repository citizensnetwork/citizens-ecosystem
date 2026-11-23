import { expect } from 'vitest';
import {
  sampleConfiguration,
  sampleEntitlements,
  validateConfiguration,
  type Configuration,
  type Entitlements,
  type Issue,
  type IssueCode,
  type ValidationOptions,
  type ValidationResult,
} from '../src/index';

/** A deep copy a test may change freely. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function issuesOf<T>(result: ValidationResult<T>): readonly Issue[] {
  return result.ok ? [] : result.issues;
}

/** The sample configuration with one change, checked against the sample entitlements. */
export function checkSample(
  change: (configuration: Configuration, entitlements: Entitlements) => void,
  options?: ValidationOptions,
): ValidationResult<Configuration> {
  const configuration = clone(sampleConfiguration);
  const entitlements = clone(sampleEntitlements);
  change(configuration, entitlements);
  return validateConfiguration(configuration, entitlements, options);
}

/** The result must fail with this issue code, at a path that starts with `path`. */
export function expectIssue<T>(result: ValidationResult<T>, code: IssueCode, path = ''): Issue {
  const issues = issuesOf(result);
  const found = issues.find((issue) => issue.code === code && issue.path.startsWith(path));
  expect(
    found,
    `expected a "${code}" issue at "${path}"; got ${JSON.stringify(issues)}`,
  ).toBeDefined();
  expect(result.ok).toBe(false);
  return found as Issue;
}
