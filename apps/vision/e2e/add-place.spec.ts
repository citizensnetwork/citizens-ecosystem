import { expect, test } from "@playwright/test";
import { mockAppShell } from "./support/app-shell";

// Demo mode never calls the API. A place with coordinates is written into the
// sample points the Timeline Map reads; a name alone is not.

async function openActivities(page: import("@playwright/test").Page) {
  await mockAppShell(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo (Hope Collective)" }).click();
  await page.getByRole("button", { name: "Activities", exact: true }).click();
  await expect(page.getByText("Activity log")).toBeVisible();
}

test.describe("Add a place to a logged activity", () => {
  test("Escape and Cancel close the editor and return focus", async ({ page }) => {
    await openActivities(page);
    const row = page.getByRole("row", { name: /Community Food Drive/ });
    const add = row.getByRole("button", { name: "Add a place" });
    await add.focus();
    await page.keyboard.press("Enter");

    const editor = page.locator("#cv-place-editor-act-1");
    const field = editor.getByRole("combobox", { name: /Place/ });
    await expect(field).toBeFocused();
    await field.fill("Hatfield");
    await page.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);
    await expect(add).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(field).toBeFocused();
    await editor.getByRole("button", { name: "Cancel" }).click();
    await expect(editor).toHaveCount(0);
    await expect(add).toBeFocused();
  });

  test("saves a name with no map position and says so", async ({ page }) => {
    await openActivities(page);
    const row = page.getByRole("row", { name: /Winter Blanket Drive/ });
    await row.getByRole("button", { name: "Add a place" }).click();
    const editor = page.locator("#cv-place-editor-act-4");
    await editor.getByRole("combobox", { name: /Place/ }).fill("Name only hall");
    await editor.getByRole("button", { name: "Save" }).click();

    await expect(editor).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Name only hall" })).toBeVisible();
    await expect(row.getByText("Saved without a map position")).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const rows = (window as unknown as { CV_DATA: { mapActivities: { id: string }[] } }).CV_DATA.mapActivities;
      return rows.some((r) => r.id === "act-4");
    })).toBe(false);
  });

  test("a saved spot appears on the Timeline Map, and the place can be edited", async ({ page }) => {
    await openActivities(page);
    const row = page.getByRole("row", { name: /Soup Kitchen/ });
    await row.getByRole("button", { name: "Add a place" }).click();
    const editor = page.locator("#cv-place-editor-act-3");
    const field = editor.getByRole("combobox", { name: /Place/ });
    await field.fill("-25.7461, 28.1881");
    await page.getByRole("option", { name: /Coordinates -25.74610, 28.18810/ }).click();
    await field.fill("E2e Hall");
    await editor.getByRole("button", { name: "Save" }).click();

    await expect(row.getByRole("button", { name: "E2e Hall" })).toBeVisible();
    await expect(row.getByText("On the Timeline Map")).toBeVisible();

    // Edit stays on this screen: leaving and coming back remounts the log.
    await row.getByRole("button", { name: "E2e Hall" }).click();
    await expect(field).toHaveValue("E2e Hall");
    await field.fill("E2e Hall west");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(row.getByRole("button", { name: "E2e Hall west" })).toBeVisible();
    await expect(row.getByText("On the Timeline Map")).toBeVisible();

    await page.getByRole("button", { name: "Timeline Map", exact: true }).click();
    await page.getByText(/Show the \d+ activities in this window as a list/).click();
    await expect(page.getByRole("button", { name: /E2e Hall west/ })).toBeVisible();
  });
});
