/**
 * The join page is a single HTML file. These tests open it the way a browser would
 * and check the parts a person actually uses: the two brands in the bar, that every
 * section can be submitted, and that only Connect and Wear can be chosen.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom") as {
  JSDOM: new (
    html: string,
    options: { url: string; runScripts: "dangerously"; pretendToBeVisual: boolean },
  ) => { window: Window & typeof globalThis };
};

const HTML_PATH = join(process.cwd(), "tools/google-forms/intake.html");
const GS_PATH = join(process.cwd(), "tools/google-forms/intake.gs");
const EXEC = "https://script.google.com/macros/s/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij/exec";

function page(search = "", connected = false, url = "") {
  let html = readFileSync(HTML_PATH, "utf8");
  if (connected) {
    html = html.replace('name="citizens-intake-submit" content=""', `name="citizens-intake-submit" content="${EXEC}"`);
  }
  return new JSDOM(html, {
    url: url || `https://219.co.za/join${search}`,
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
}

function fill(document: Document) {
  (document.getElementById("full-name") as HTMLInputElement).value = "Amina Example";
  (document.getElementById("owner-email") as HTMLInputElement).value = "amina@example.com";
  (document.getElementById("listing-name") as HTMLInputElement).value = "Example Fellowship";
  (document.querySelector('[data-phrase="organisation type"]') as HTMLInputElement).value = "Church";
  (document.getElementById("category") as HTMLSelectElement).value = "Church";
  (document.getElementById("faith") as HTMLInputElement).checked = true;
  (document.getElementById("permission") as HTMLInputElement).checked = true;
}

describe("intake.html join page", () => {
  it("shows 219. and Citizens, and lets every section be finished", () => {
    const { window } = page();
    const document = window.document;
    expect(document.querySelector(".mark")?.textContent).toBe("219.");
    expect(document.querySelector(".word")?.textContent).toBe("Citizens");
    expect(document.querySelector(".mark")?.getAttribute("href")).toBe("https://219.co.za/");
    expect(document.querySelector("footer")?.textContent).toMatch(/Citizens apps/);
    expect(document.querySelector(".top")?.tagName).toBe("HEADER");

    const sections = [...document.querySelectorAll<HTMLElement>("[data-step]")];
    expect(sections).toHaveLength(6);
    for (const section of sections) {
      expect(section.querySelector("[data-finish]")?.textContent).toBe("Finish and submit");
      expect(section.querySelector(".nudge")?.textContent).toMatch(/more you share/i);
    }
    for (const id of ["vision", "learn", "play", "move", "impact"]) {
      expect((document.querySelector(`option[value="${id}"]`) as HTMLOptionElement).disabled).toBe(true);
    }
    expect((document.querySelector('option[value="connect"]') as HTMLOptionElement).disabled).toBe(false);
    expect((document.querySelector('option[value="wear"]') as HTMLOptionElement).disabled).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--gold").trim()).toBe("#f2bd22");
  });

  it("opens Wear from a source link, and says so when a locked app was asked for", () => {
    const wear = page("?app=wear").window.document;
    expect((wear.getElementById("app") as HTMLSelectElement).value).toBe("wear");
    expect(wear.querySelector("h1")?.textContent).toMatch(/brand/i);
    expect(wear.documentElement.style.getPropertyValue("--gold").trim()).toBe("#c9a84c");
    expect((wear.querySelector("[data-only='wear']") as HTMLElement).hidden).toBe(false);

    const viaPlatform = page("?platform=wear").window.document;
    expect((viaPlatform.getElementById("app") as HTMLSelectElement).value).toBe("wear");

    const locked = page("?app=vision").window.document;
    expect((locked.getElementById("app") as HTMLSelectElement).value).toBe("connect");
    expect((locked.getElementById("app-note") as HTMLElement).hidden).toBe(false);
    expect(locked.getElementById("app-note")?.textContent).toMatch(/Vision/);
    expect(locked.getElementById("app-note")?.textContent).toMatch(/Connect and Wear/);
  });

  it("moves through the sections, and will not send until the essentials are in", () => {
    const { window } = page();
    const document = window.document;
    (document.querySelector("[data-next]") as HTMLButtonElement).click();
    expect((document.querySelector('[data-step="0"]') as HTMLElement).hidden).toBe(true);
    expect((document.querySelector('[data-step="1"]') as HTMLElement).hidden).toBe(false);

    (document.querySelector('[data-value="Christian Business"]') as HTMLButtonElement).click();
    expect((document.querySelector('[data-phrase="organisation type"]') as HTMLInputElement).value).toBe(
      "Christian Business",
    );
    expect(document.querySelector('[data-value="Christian Business"]')?.getAttribute("aria-pressed")).toBe("true");

    (document.querySelector("[data-step='1'] [data-finish]") as HTMLButtonElement).click();
    expect(document.getElementById("form-alert")?.textContent).toMatch(/name/i);
    expect((document.querySelector('[data-step="0"]') as HTMLElement).hidden).toBe(false);
  });

  it("posts the sheet phrases to the web app, and only to a script.google.com address", async () => {
    const bare = page();
    fill(bare.window.document);
    (bare.window.document.querySelector("[data-finish]") as HTMLButtonElement).click();
    expect(bare.window.document.getElementById("form-alert")?.textContent).toMatch(/no sheet/i);

    const dom = page("", true);
    const document = dom.window.document;
    const posts: HTMLFormElement[] = [];
    dom.window.HTMLFormElement.prototype.submit = function submit(this: HTMLFormElement) {
      posts.push(this);
    };
    fill(document);
    (document.querySelector("[data-finish]") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(posts).toHaveLength(1);
    expect(posts[0].getAttribute("action")).toBe(EXEC);

    const devUrl = "https://script.google.com/a/macros/219.co.za/s/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij/dev";
    const opened = page("", true, devUrl);
    const devPosts: HTMLFormElement[] = [];
    opened.window.HTMLFormElement.prototype.submit = function submit(this: HTMLFormElement) {
      devPosts.push(this);
    };
    fill(opened.window.document);
    (opened.window.document.querySelector("[data-finish]") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(devPosts[0]?.getAttribute("action")).toBe(devUrl);
    expect(posts[0].querySelector<HTMLInputElement>('input[name="reply"]')?.value).toBe("html");
    const body = JSON.parse(posts[0].querySelector<HTMLInputElement>('input[name="payload"]')?.value || "{}");
    expect(body.app).toBe("connect");
    expect(body.company_url).toBe("");
    expect(body.answers["owner's email"]).toBe("amina@example.com");
    expect(body.answers["organisation / ministry name"]).toBe("Example Fellowship");
    expect(body.answers["primary category"]).toBe("Church");
    expect(body.nonce).toMatch(/^[a-f0-9]{32}$/);

    const select = document.getElementById("app") as HTMLSelectElement;
    select.value = "wear";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(document.querySelector("h1")?.textContent).toMatch(/brand/i);
    expect((document.getElementById("permission") as HTMLInputElement).value).toMatch(/Wear/);
    expect((document.querySelector("[data-only='wear']") as HTMLElement).hidden).toBe(false);
  });

  it("uses the same phrases and category labels the sheet script accepts", () => {
    const html = readFileSync(HTML_PATH, "utf8");
    const gs = readFileSync(GS_PATH, "utf8");
    expect(html).not.toContain("INTAKE_SECRET");
    expect(html).not.toContain("INTAKE_WEBHOOK");

    const phrases = [...page().window.document.querySelectorAll("[data-phrase]")].map(
      (el) => el.getAttribute("data-phrase") || "",
    );
    expect(phrases.length).toBeGreaterThan(20);
    expect(new Set(phrases).size).toBe(phrases.length);
    for (const phrase of phrases) expect(gs, phrase).toContain(phrase);

    const { window } = page();
    const block = gs.slice(gs.indexOf("var WEB_CATEGORIES = ["), gs.indexOf("];", gs.indexOf("var WEB_CATEGORIES")));
    const labels = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    const options = [...window.document.querySelectorAll("#category option")].map((option) => option.textContent);
    expect(labels).toHaveLength(12);
    for (const label of labels) expect(options).toContain(label);

    const kinds = [...window.document.querySelectorAll('[data-choice="type"] .choice')].map((button) =>
      button.getAttribute("data-value"),
    );
    expect(kinds).toEqual(["Church", "Christian Nonprofit / Ministry", "Christian Business", "Individual"]);
  });
});
