import { expect, test } from "@playwright/test";
import { mockAppShell } from "./support/app-shell";

// The Timeline Map is reachable with no real session: "Explore the demo"
// signs in locally (store.jsx enterDemo) and never sets an auth cookie.
// A MapTiler 401 is the key-refused path in app/views.jsx: the activity
// stays, and the base map becomes the plain parchment style.

const REFUSED =
  "The street-map provider did not accept this site, so your activities are shown on a plain background.";

test.describe("Timeline Map", () => {
  test("shows a plain background when the map key is refused", async ({ page }) => {
    await mockAppShell(page, { maptilerKey: "e2e-map-key", maptilerStatus: 401 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore the demo (Hope Collective)" }).click();
    await page.getByRole("button", { name: "Timeline Map" }).click();

    await expect(page.getByText("sample data")).toBeVisible();
    await expect(page.getByRole("img", { name: "Map of your activities" })).toBeVisible();
    await expect(page.getByText(REFUSED)).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const map = (
            window as unknown as {
              __cvMap?: {
                getLayer: (id: string) => unknown;
                getPaintProperty: (id: string, prop: string) => unknown;
              };
            }
          ).__cvMap;
          if (!map || !map.getLayer("cv-ground")) return null;
          return map.getPaintProperty("cv-ground", "background-color");
        }),
      )
      .toBe("#f7f4ee");
  });
});
