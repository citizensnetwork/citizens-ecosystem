import { chromium, devices } from "@playwright/test";

const origin = "https://219.co.za";
const prefix = "/citizens/connect";
const guestRoutes = [
  ["CC-02", "/", "discover"],
  ["CC-03", "/discover", "kingdom-discovery"],
  ["CC-04", "/community", "community"],
];

export async function publicChecks(record) {
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    for (const id of [
      "CC-01",
      ...guestRoutes.map(([id]) => id),
      "CC-05",
      "CC-06",
    ]) {
      record(id, "blocked", "Chromium unavailable on runner.");
    }
    return;
  }

  async function check(id, path, screen, mobile = false) {
    const context = await browser.newContext({
      ...(mobile ? devices["Pixel 7"] : {}),
      serviceWorkers: "block",
    });
    try {
      await context.routeWebSocket("**/*", (socket) => socket.close());
      await context.route("**/*", (route) => {
        const method = route.request().method();
        return ["GET", "HEAD"].includes(method)
          ? route.continue()
          : route.abort();
      });
      const page = await context.newPage();
      let response;
      try {
        response = await page.goto(origin + prefix + path, {
          waitUntil: "domcontentloaded",
          timeout: 25_000,
        });
      } catch {
        record(
          id,
          "blocked",
          "Browser navigation failed before an HTTP response was observed.",
        );
        return;
      }
      const status = response?.status();
      if (!status || [401, 403, 429].includes(status)) {
        record(id, "blocked", `Runner received HTTP ${status ?? "unknown"}.`);
        return;
      }
      const url = new URL(page.url());
      const expectedPath = prefix + path.replace(/\/$/, "");
      if (
        status >= 400 ||
        url.origin !== origin ||
        url.pathname.replace(/\/$/, "") !== expectedPath
      ) {
        record(
          id,
          "fail",
          `HTTP ${status} or unexpected redirect for ${path}.`,
        );
        return;
      }
      try {
        if (screen) {
          const surface = page.locator(`[data-screen="${screen}"]`);
          if (id === "CC-02") {
            const guest = page.getByRole("button", { name: "Browse as Guest" });
            await surface.or(guest).first().waitFor({ timeout: 15_000 });
            if (await guest.isVisible()) await guest.click({ timeout: 5_000 });
          }
          await surface.waitFor({ timeout: 15_000 });
        } else if (!(await page.title()).includes("Citizens Connect")) {
          throw new Error("Unexpected title");
        }
        if (
          mobile &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ))
        ) {
          throw new Error("Horizontal overflow");
        }
        record(
          id,
          "pass",
          `HTTP ${status}, ${screen ?? "Connect title"} verified${mobile ? " at mobile width" : ""}.`,
        );
      } catch {
        record(
          id,
          "fail",
          "Expected screen, title or viewport assertion failed.",
        );
      }
    } finally {
      await context.close();
    }
  }

  try {
    await check("CC-01", "/", null);
    for (const [id, path, screen] of guestRoutes) await check(id, path, screen);
    await check("CC-05", "/discover", "kingdom-discovery", true);
    record(
      "CC-06",
      "not_run",
      "Exploratory listing, navigation and accessibility review needs a separate walkthrough.",
    );
  } finally {
    await browser.close();
  }
}
