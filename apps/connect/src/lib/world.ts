/**
 * The world this server speaks for: its words, from the tenant configuration contract
 * (`@engine/config`, engine step E3). The browser app reads the same world from
 * `src/frontend/engine-world.js` (`window.WORLD`); server code that writes words a person
 * sees (emails, calendar files) reads this one, so both say the same thing.
 *
 * This build carries the Citizens configuration, checked by @engine/config's own tests.
 * `createWorld` comes from the validation-free entry: the document is already checked there.
 */
import { createWorld } from "@engine/config/world";
import { citizensConfiguration, citizensEntitlements } from "@engine/config/citizens";

export const world = createWorld(citizensConfiguration, citizensEntitlements);

/** A term inside a sentence that writes it in lower case ("citizens across the city"). */
export function lowerTerm(...args: Parameters<typeof world.term>): string {
  return world.term(...args).toLocaleLowerCase("en");
}
