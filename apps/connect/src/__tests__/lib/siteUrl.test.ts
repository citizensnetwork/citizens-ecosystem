/**
 * The public base every absolute link is built on (src/lib/siteUrl.ts): an ORIGIN
 * (`NEXT_PUBLIC_SITE_URL`, or the request's) plus the app's path prefix. With
 * NEXT_PUBLIC_BASE_PATH unset (today) every link is exactly what it always was; with
 * /citizens/connect (C39) the prefix follows the origin and `NEXT_PUBLIC_SITE_URL` stays an origin.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { siteBase, sitePrefix, withSitePrefix } from "@/lib/siteUrl";

afterEach(() => {
  vi.unstubAllEnvs();
});

const REQ = new Request("https://www.citizens.example/api/x?y=1");

describe("with no base path configured (today)", () => {
  it("adds nothing, however the variable is blank", () => {
    for (const raw of [undefined, "", "   ", "/"]) {
      if (raw === undefined) vi.stubEnv("NEXT_PUBLIC_BASE_PATH", undefined as unknown as string);
      else vi.stubEnv("NEXT_PUBLIC_BASE_PATH", raw);
      expect(sitePrefix(), String(raw)).toBe("");
      expect(withSitePrefix("https://www.citizenscentral.co.za"), String(raw)).toBe("https://www.citizenscentral.co.za");
    }
  });

  it("leaves siteBase equal to the origin siteOrigin gives (the pinned production links)", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteBase(REQ)).toBe("https://www.citizens.example");
    expect(siteBase()).toBe("https://www.citizenscentral.co.za");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://connect.citizens.example//");
    expect(siteBase(REQ)).toBe("https://connect.citizens.example");
  });
});

describe("with NEXT_PUBLIC_BASE_PATH=/citizens/connect", () => {
  it("puts the prefix after the origin, a trailing slash on the variable forgiven", () => {
    for (const raw of ["/citizens/connect", "/citizens/connect/"]) {
      vi.stubEnv("NEXT_PUBLIC_BASE_PATH", raw);
      expect(sitePrefix()).toBe("/citizens/connect");
      expect(withSitePrefix("https://219.example")).toBe("https://219.example/citizens/connect");
    }
  });

  it("builds siteBase from the configured origin, else the request's, else the production site", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/citizens/connect");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://219.example/");
    expect(siteBase(REQ)).toBe("https://219.example/citizens/connect");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteBase(REQ)).toBe("https://www.citizens.example/citizens/connect");
    expect(siteBase()).toBe("https://www.citizenscentral.co.za/citizens/connect");
  });

  it("makes a link that starts where the page does", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/citizens/connect");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://219.example");
    expect(`${siteBase(REQ)}/c/grace-point`).toBe("https://219.example/citizens/connect/c/grace-point");
    expect(`${siteBase(REQ)}/dashboard`).toBe("https://219.example/citizens/connect/dashboard");
  });
});

describe("a wrong value fails loudly instead of building a link nobody can open", () => {
  it("refuses another app's path and anything else", () => {
    for (const raw of ["/citizens/vision", "/citizens/wear", "/connect", "citizens/connect", "/citizens/connect/x", "//evil.example"]) {
      vi.stubEnv("NEXT_PUBLIC_BASE_PATH", raw);
      expect(() => sitePrefix(), raw).toThrow(/NEXT_PUBLIC_BASE_PATH/);
    }
  });
});
