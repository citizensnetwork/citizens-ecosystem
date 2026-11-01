/**
 * C41: the public chip and the edit switch. The chip is absent unless the
 * listing has turned the flag on, and its colour is the accent token.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("open to collaborate", () => {
  const strings = loadFrontend("map-v2-strings.jsx").MapV2Strings as {
    sheet: { collaborate: string; collaborateHint: string };
  };

  it("keeps the label and the hint in the strings file", () => {
    expect(strings.sheet.collaborate).toBe("Open to collaborate");
    expect(strings.sheet.collaborateHint.split(/\s+/).length).toBeLessThanOrEqual(12);
    expect(strings.sheet.collaborateHint).toMatch(/organisations/);
  });

  it("draws the chip only when the flag is on, and not as a button", () => {
    const sheet = read("src/frontend/app/map-v2-sheet.jsx");
    expect(sheet).toContain("isContributor && item.openToCollaborate");
    expect(sheet).toContain("'data-mv2': 'collab-chip'");
    expect(sheet).toContain("Str.collaborate");
    expect(sheet).toContain("if (collabChip && !expanded) actions.unshift(collabChip)");
    expect(sheet).toContain("expanded && collabChip");
    expect(sheet).not.toMatch(/collab-chip'[^)]*<button/);

    const profile = read("src/frontend/app/profiles.jsx");
    expect(profile).toContain("c.openToCollaborate && h('span', { 'data-mv2': 'collab-chip' }");
    expect(profile).toContain("window.MapV2Strings.sheet.collaborate");
  });

  it("puts a disabled-for-viewers switch on the edit form and sends a boolean", () => {
    const dash = read("src/frontend/app/dashboard.jsx");
    expect(dash).toContain("checked: f.openToCollaborate");
    expect(dash).toContain("disabled: locked");
    expect(dash).toContain("window.MapV2Strings.sheet.collaborate");
    const store = read("src/frontend/app/store.jsx");
    expect(store).toContain("openToCollaborate: r.open_to_collaborate === true");
    expect(store).toContain(
      "open_to_collaborate: fields.openToCollaborate !== undefined ? !!fields.openToCollaborate : undefined",
    );
    expect(store).toContain("open_to_collaborate");
  });

  it("paints the chip with the accent token, never a raw gold", () => {
    const css = read("src/frontend/assets/map-v2.css");
    const rule = css.slice(css.indexOf("[data-mv2='collab-chip']"), css.indexOf("[data-mv2='collab-chip'] svg"));
    expect(rule).toContain("background: var(--accent);");
    expect(rule).toContain("color: var(--accent-contrast);");
    expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(css).not.toMatch(/#c9a84c/i);
  });
});
