/**
 * @engine/config: the tenant configuration contract of the map engine.
 *
 * Read the README first. In short:
 * - `validateEntitlements` and `validateConfiguration` check the two documents (schema.ts).
 * - `createWorld` turns a checked configuration into answers for the app (world.ts).
 * - `citizensConfiguration` and `sampleConfiguration` are the two configurations in this
 *   repository (configs/).
 */

export * from './version';
export * from './features';
export * from './registry';
export * from './vocabulary';
export * from './theme';
export * from './schema';
export * from './world';
export { citizensConfiguration, citizensEntitlements } from './configs/citizens';
export { sampleConfiguration, sampleEntitlements } from './configs/sample';
