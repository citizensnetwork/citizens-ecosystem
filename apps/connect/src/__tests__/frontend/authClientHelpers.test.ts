/**
 * `src/frontend/auth-client.js` is a classic browser script (an IIFE that
 * publishes onto `window`), so — like socialsAndZoom.test.ts — it is evaluated
 * here against a stub `window`. With no Supabase configured it takes its early
 * "not configured" return, which is exactly why the pure email-code helpers are
 * defined ABOVE that return: they need no network and are the only part of the
 * sign-in screen with real logic (what counts as an email, what a pasted code
 * becomes, which words a person sees when something fails).
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Helpers = {
  normaliseEmail: (v: unknown) => string;
  isValidEmail: (v: unknown) => boolean;
  cleanCode: (v: unknown) => string;
  mapAuthError: (err: unknown, step: "send" | "verify") => string;
  displayNameFor: (email: unknown) => string;
};

let A: Helpers;

beforeAll(() => {
  const src = readFileSync(join(process.cwd(), "src/frontend/auth-client.js"), "utf8");
  const win: Record<string, unknown> = {};
  // The script warns once that Supabase isn't configured; that's expected here.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  new Function("window", src)(win);
  warn.mockRestore();
  A = win.CC_AUTH_HELPERS as Helpers;
});

describe("the helpers are available without Supabase", () => {
  it("publishes every helper the sign-in screen uses", () => {
    expect(Object.keys(A).sort()).toEqual([
      "cleanCode",
      "displayNameFor",
      "isValidEmail",
      "mapAuthError",
      "normaliseEmail",
    ]);
  });
});

describe("normaliseEmail / isValidEmail", () => {
  it("trims and lower-cases so the same inbox is always the same address", () => {
    expect(A.normaliseEmail("  Studio@HarvestRadio.EXAMPLE \n")).toBe("studio@harvestradio.example");
  });

  it("treats null and undefined as empty rather than the text 'null'", () => {
    expect(A.normaliseEmail(null)).toBe("");
    expect(A.normaliseEmail(undefined)).toBe("");
  });

  it("accepts ordinary addresses, including surrounding whitespace", () => {
    expect(A.isValidEmail("studio@harvestradio.example")).toBe(true);
    expect(A.isValidEmail("  Jane.Doe+news@gmail.com ")).toBe(true);
  });

  it.each(["", "   ", "plain", "a@b", "@x.com", "a b@c.com", "a@b@c.com", null, undefined])(
    "rejects %j",
    (bad) => {
      expect(A.isValidEmail(bad)).toBe(false);
    },
  );
});

describe("cleanCode", () => {
  it.each([
    ["123456", "123456"],
    ["123 456", "123456"], // how some mail apps display it
    ["123-456", "123456"],
    [" 12 34 56\n", "123456"], // a messy paste
  ])("turns %j into %j", (typed, expected) => {
    expect(A.cleanCode(typed)).toBe(expected);
  });

  it("never returns more than six digits", () => {
    expect(A.cleanCode("12345678")).toBe("123456");
  });

  it("drops anything that isn't a digit", () => {
    expect(A.cleanCode("abc")).toBe("");
    expect(A.cleanCode("12a3b4")).toBe("1234");
    expect(A.cleanCode(null)).toBe("");
    expect(A.cleanCode(undefined)).toBe("");
  });
});

describe("mapAuthError — plain language, never raw GoTrue text", () => {
  const WRONG_CODE = "That code didn't work or has expired — request a new one.";
  const SLOW_DOWN = "Too many attempts — wait a minute and try again.";
  const OFFLINE = "We couldn't reach Citizens — check your connection and try again.";

  it("explains a wrong or expired code, whatever shape GoTrue returns it in", () => {
    expect(
      A.mapAuthError({ status: 403, code: "otp_expired", message: "Token has expired or is invalid" }, "verify"),
    ).toBe(WRONG_CODE);
    expect(A.mapAuthError({ status: 403, message: "whatever" }, "verify")).toBe(WRONG_CODE);
    expect(A.mapAuthError({ message: "Token has expired or is invalid" }, "verify")).toBe(WRONG_CODE);
  });

  it("asks for a pause when rate limited, on either step", () => {
    const limited = {
      status: 429,
      code: "over_email_send_rate_limit",
      message: "For security purposes, you can only request this after 56 seconds.",
    };
    expect(A.mapAuthError(limited, "send")).toBe(SLOW_DOWN);
    expect(A.mapAuthError(limited, "verify")).toBe(SLOW_DOWN);
    expect(A.mapAuthError({ message: "email rate limit exceeded" }, "send")).toBe(SLOW_DOWN);
  });

  it("rate limiting wins even when the status also looks like a bad code (403/429 overlap)", () => {
    expect(A.mapAuthError({ status: 429, code: "otp_expired", message: "x" }, "verify")).toBe(SLOW_DOWN);
  });

  it("recognises a network failure", () => {
    expect(A.mapAuthError({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }, "send")).toBe(
      OFFLINE,
    );
    expect(A.mapAuthError(new TypeError("Failed to fetch"), "verify")).toBe(OFFLINE);
    expect(A.mapAuthError({ message: "Load failed" }, "send")).toBe(OFFLINE);
  });

  it("says when GoTrue rejected the address itself", () => {
    expect(
      A.mapAuthError({ status: 400, code: "email_address_invalid", message: 'Email address "x" is invalid' }, "send"),
    ).toBe("That email address doesn't look right — check it and try again.");
  });

  it("points at Google if the project has sign-ups switched off", () => {
    expect(A.mapAuthError({ status: 422, code: "signup_disabled", message: "Signups not allowed for otp" }, "send")).toBe(
      "New accounts can't be created with email right now. Please continue with Google.",
    );
  });

  it("falls back to a generic line for anything unknown, including no error at all", () => {
    expect(A.mapAuthError({ status: 500, message: "boom" }, "send")).toBe("Something went wrong. Please try again.");
    expect(A.mapAuthError(null, "send")).toBe("Something went wrong. Please try again.");
    expect(A.mapAuthError(undefined, "verify")).toBe("Something went wrong. Please try again.");
  });

  it("never echoes the raw error to the person", () => {
    const text = A.mapAuthError({ status: 500, code: "unexpected_failure", message: '{"msg":"db password leaked"}' }, "send");
    expect(text).not.toMatch(/db password|\{|unexpected_failure/);
  });
});

describe("displayNameFor — a readable stand-in for someone with no name yet", () => {
  it.each([
    ["studio@harvestradio.example", "Studio"],
    ["jane.doe+news@gmail.com", "Jane Doe"],
    ["mary_ann-smith@example.org", "Mary Ann Smith"],
    ["zoë.müller@example.de", "Zoë Müller"],
  ])("turns %j into %j", (email, expected) => {
    expect(A.displayNameFor(email)).toBe(expected);
  });

  it("keeps at most three words", () => {
    expect(A.displayNameFor("a.b.c.d.e@example.org")).toBe("A B C");
  });

  it("never contains the domain or the @ (it is shown on screen)", () => {
    const name = A.displayNameFor("someone@secret-domain.com");
    expect(name).not.toMatch(/@|secret|domain|\.com/);
  });

  it.each(["12345@example.org", "@example.org", "", "...@example.org", null, undefined])(
    "falls back to 'Citizen' for %j (no letters to work with)",
    (email) => {
      expect(A.displayNameFor(email)).toBe("Citizen");
    },
  );

  it("is never blank and never longer than 40 characters", () => {
    const long = A.displayNameFor(`${"x".repeat(100)}@example.org`);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.length).toBeGreaterThan(0);
  });
});
