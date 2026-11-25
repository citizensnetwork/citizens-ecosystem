// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/rate-limit";
import { POST } from "@/app/api/csp-report/route";

// POST /api/csp-report (QA fix plan PR F3): public, rate-limited, size-capped, logs a sanitised line, stores nothing.

const report = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    "csp-report": {
      "document-uri": "https://219.example/citizens/connect/auth/callback?code=SECRET",
      "effective-directive": "script-src-elem",
      "blocked-uri": "inline",
      disposition: "report",
      "script-sample": "steal(document.cookie)",
      ...over,
    },
  });

const post = (body: string, headers: Record<string, string> = {}, ip = "203.0.113.7") =>
  new NextRequest("https://219.example/citizens/connect/api/csp-report", {
    method: "POST",
    body,
    headers: { "content-type": "application/csp-report", "x-forwarded-for": ip, ...headers },
  });

describe("POST /api/csp-report", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetRateLimitStore();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("answers 204 and logs one sanitised line: no query string, no script sample", async () => {
    const res = await POST(post(report()));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line.startsWith("[csp-report] ")).toBe(true);
    expect(JSON.parse(line.slice("[csp-report] ".length))).toEqual({
      directive: "script-src-elem",
      blocked: "inline",
      page: "https://219.example/citizens/connect/auth/callback",
      disposition: "report",
    });
    expect(line).not.toContain("SECRET");
    expect(line).not.toContain("cookie");
  });

  it("reads the Reporting API format too", async () => {
    const body = JSON.stringify([
      { type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://x.example/a.png?t=1", documentURL: "https://219.example/" } },
    ]);
    const res = await POST(post(body, { "content-type": "application/reports+json" }));
    expect(res.status).toBe(204);
    expect(String(warn.mock.calls[0][0])).toContain('"blocked":"https://x.example/a.png"');
  });

  it("refuses a body over 16 KB with 413, logging nothing", async () => {
    const res = await POST(post(report({ "blocked-uri": "x".repeat(20_000) })));
    expect(res.status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs nothing for garbage, and still answers 204", async () => {
    expect((await POST(post("not json"))).status).toBe(204);
    expect((await POST(post("[]", { "content-type": "text/plain" }))).status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it("limits each IP to 30 a minute (429), without affecting another IP", async () => {
    for (let i = 0; i < 30; i++) expect((await POST(post(report()))).status).toBe(204);
    expect((await POST(post(report()))).status).toBe(429);
    expect((await POST(post(report(), {}, "198.51.100.9"))).status).toBe(204);
  });
});
