/**
 * The world this app shows: its words, its categories and its switches, from the tenant
 * configuration contract (`@engine/config`, engine step E3). Engine step E7 wires the screens
 * to it, so a screen asks the world for a word instead of holding one.
 *
 * Real ESM: the build bundles it into one hashed IIFE (`browserBundles` in
 * scripts/build-frontend.js), loaded before auth-client.js and the screens, which read
 * `window.WORLD` (`WORLD.t(key)`, `WORLD.term(key, form)`, `WORLD.configuration.categories`).
 *
 * This build carries the Citizens configuration, checked by @engine/config's own tests
 * (`citizens-parity.test.ts`). `createWorld` comes from the validation-free entry, so the
 * browser never downloads the schema library.
 */
import { createWorld } from '@engine/config/world';
import { citizensConfiguration, citizensEntitlements } from '@engine/config/citizens';

window.WORLD = Object.freeze(createWorld(citizensConfiguration, citizensEntitlements));
