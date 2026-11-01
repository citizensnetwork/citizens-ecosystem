/**
 * Vision reads Connect's /api/v1 over HTTP from CONNECT_API_BASE_URL. Once Connect is served under
 * /citizens/connect (C39) that variable carries a path, and the client must keep it: URL resolution
 * ("/api/v1/x" against "https://host/citizens/connect") would drop it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ENV = "CONNECT_API_BASE_URL";
const saved = process.env[ENV];

afterEach(() => {
  if (saved === undefined) delete process.env[ENV];
  else process.env[ENV] = saved;
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** Calls connectApi.getEvent("e1") with CONNECT_API_BASE_URL=base and returns the URL that was fetched. */
async function fetchedUrl(base: string, call: "getEvent" | "listEvents" = "getEvent"): Promise<string> {
  process.env[ENV] = base;
  vi.resetModules();
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: {}, meta: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const { connectApi } = await import("@/lib/connect/api");
  if (call === "getEvent") await connectApi.getEvent("e1");
  else await connectApi.listEvents({ limit: 5 });
  return String((fetchMock.mock.calls as unknown as unknown[][])[0]![0]);
}

describe("Connect API base URL", () => {
  it("keeps the /citizens/connect prefix of the base", async () => {
    expect(await fetchedUrl("https://citizens-ecosystem-connect.vercel.app/citizens/connect")).toBe(
      "https://citizens-ecosystem-connect.vercel.app/citizens/connect/api/v1/events/e1",
    );
  });

  it("forgives trailing slashes on the base", async () => {
    expect(await fetchedUrl("https://connect.example/citizens/connect/")).toBe(
      "https://connect.example/citizens/connect/api/v1/events/e1",
    );
    expect(await fetchedUrl("https://connect.example//")).toBe("https://connect.example/api/v1/events/e1");
  });

  it("is unchanged for a base with no path (production today)", async () => {
    expect(await fetchedUrl("https://citizens-ecosystem-connect.vercel.app")).toBe(
      "https://citizens-ecosystem-connect.vercel.app/api/v1/events/e1",
    );
  });

  it("still adds the query string after the prefix", async () => {
    expect(await fetchedUrl("https://connect.example/citizens/connect", "listEvents")).toBe(
      "https://connect.example/citizens/connect/api/v1/events?limit=5",
    );
  });
});
