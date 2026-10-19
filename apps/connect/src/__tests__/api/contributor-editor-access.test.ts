import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../helpers/supabase-mock";

const CONTRIBUTOR_ID = "33333333-3333-4333-8333-333333333333";
const EDITOR_ID = "22222222-2222-4222-8222-222222222222";
const HANDLE = "grace-city";

const userClient = createMockSupabaseClient();
const accessMock = vi.hoisted(() => vi.fn());
const activityMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/route", () => ({
  getRouteAuth: vi.fn(async () => ({ supabase: userClient, user: { id: EDITOR_ID } })),
}));
vi.mock("@/lib/dashboard/access", () => ({
  checkDashboardAccess: accessMock,
}));
vi.mock("@/lib/dashboard/activity", () => ({
  recordContributorMutation: activityMock,
}));
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ success: true, resetMs: 0 }) };
});

const news = await import("@/app/api/contributor/[handle]/news/route");
const events = await import("@/app/api/contributor/[handle]/events/route");
const sources = await import("@/app/api/contributor/[handle]/listing-sources/route");
const profile = await import("@/app/api/contributor/[handle]/profile/route");
const team = await import("@/app/api/contributor/[handle]/team/route");
const slug = await import("@/app/api/contributor/[handle]/slug/route");

const params = { params: Promise.resolve({ handle: HANDLE }) };

function editorAccess() {
  return {
    hasAccess: true,
    isOwner: false,
    isAdminWithAccess: false,
    contributorId: CONTRIBUTOR_ID,
    teamRole: "editor" as const,
  };
}

function viewerAccess() {
  return { ...editorAccess(), teamRole: "viewer" as const };
}

function ownerAccess() {
  return { ...editorAccess(), isOwner: true, teamRole: "owner" as const };
}

function req(path: string, method: string, body?: Record<string, unknown>) {
  return new NextRequest("http://localhost" + path, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  userClient._chain._result.data = {
    id: "55555555-5555-4555-8555-555555555555",
    contributor_id: CONTRIBUTOR_ID,
    created_by: CONTRIBUTOR_ID,
    title: "Hello",
    body: "A note for citizens",
    image_url: null,
    post_date: "2026-10-19",
    kind: "website",
    url: "https://example.org",
    enabled: true,
  };
  userClient._chain._result.error = null;
  userClient._rpcChain._result.data = { success: true };
  userClient._rpcChain._result.error = null;
});

describe("editor listing writes", () => {
  it("creates a news post owned by the contributor and does not write a second activity row", async () => {
    accessMock.mockResolvedValueOnce(editorAccess());
    const res = await news.POST(
      req("/api/contributor/grace-city/news", "POST", { title: "Hello", body: "A note for citizens" }),
      params,
    );
    expect(res.status).toBe(201);
    expect(userClient._chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ contributor_id: CONTRIBUTOR_ID, title: "Hello" }),
    );
    expect(activityMock).not.toHaveBeenCalled();
  });

  it("creates an event owned by the contributor", async () => {
    accessMock.mockResolvedValueOnce(editorAccess());
    const res = await events.POST(
      req("/api/contributor/grace-city/events", "POST", { title: "Sunday", date: "2026-11-01T09:00:00.000Z" }),
      params,
    );
    expect(res.status).toBe(201);
    expect(userClient._chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: CONTRIBUTOR_ID, title: "Sunday" }),
    );
  });

  it("adds a listing source owned by the contributor", async () => {
    accessMock.mockResolvedValueOnce(editorAccess());
    const res = await sources.POST(
      req("/api/contributor/grace-city/listing-sources", "POST", { kind: "website", url: "https://example.org" }),
      params,
    );
    expect(res.status).toBe(201);
    expect(userClient._chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ contributor_id: CONTRIBUTOR_ID, kind: "website", url: "https://example.org/" }),
    );
  });

  it("updates the public profile through the allow-listed RPC", async () => {
    accessMock.mockResolvedValueOnce(editorAccess());
    const res = await profile.POST(
      req("/api/contributor/grace-city/profile", "POST", { bio: "We serve this city." }),
      params,
    );
    expect(res.status).toBe(200);
    expect(userClient.rpc).toHaveBeenCalledWith("update_contributor_public_profile", {
      p_contributor_id: CONTRIBUTOR_ID,
      p_patch: { bio: "We serve this city." },
    });
  });

  it("still logs an owner news post through the existing activity helper", async () => {
    accessMock.mockResolvedValueOnce(ownerAccess());
    const res = await news.POST(
      req("/api/contributor/grace-city/news", "POST", { title: "Hello", body: "A note for citizens" }),
      params,
    );
    expect(res.status).toBe(201);
    expect(activityMock).toHaveBeenCalledOnce();
  });
});

describe("viewer and editor owner-only refusals", () => {
  it("refuses a viewer news post", async () => {
    accessMock.mockResolvedValueOnce(viewerAccess());
    const res = await news.POST(
      req("/api/contributor/grace-city/news", "POST", { title: "Hello", body: "Nope" }),
      params,
    );
    expect(res.status).toBe(403);
    expect(userClient._chain.insert).not.toHaveBeenCalled();
  });

  it("refuses billing, role, slug and status fields and does not call the RPC", async () => {
    for (const field of ["billing_tier", "role", "contributor_slug", "contributor_status", "contributor_hidden", "email"]) {
      accessMock.mockResolvedValueOnce(editorAccess());
      const res = await profile.POST(
        req("/api/contributor/grace-city/profile", "POST", { [field]: "nope", bio: "ok" }),
        params,
      );
      expect(res.status, field).toBe(403);
      const json = await res.json();
      expect(json.field).toBe(field);
    }
    expect(userClient.rpc).not.toHaveBeenCalled();
  });

  it("refuses listing deletion", async () => {
    accessMock.mockResolvedValueOnce(editorAccess());
    const res = await profile.DELETE(req("/api/contributor/grace-city/profile", "DELETE"), params);
    expect(res.status).toBe(403);
  });

  it("refuses team invite, owner transfer, removal and role change", async () => {
    const membershipId = "66666666-6666-4666-8666-666666666666";
    accessMock.mockResolvedValueOnce(editorAccess());
    expect((await team.POST(req("/api/contributor/grace-city/team", "POST", { action: "invite", role: "viewer" }), params)).status).toBe(403);

    accessMock.mockResolvedValueOnce(editorAccess());
    expect((await team.POST(
      req("/api/contributor/grace-city/team", "POST", { action: "propose_owner_transfer", member_id: membershipId }),
      params,
    )).status).toBe(403);

    accessMock.mockResolvedValueOnce(editorAccess());
    expect((await team.PATCH(
      req("/api/contributor/grace-city/team", "PATCH", { action: "remove", membership_id: membershipId }),
      params,
    )).status).toBe(403);

    accessMock.mockResolvedValueOnce(editorAccess());
    expect((await team.PATCH(
      req("/api/contributor/grace-city/team", "PATCH", { action: "change_role", membership_id: membershipId, role: "viewer" }),
      params,
    )).status).toBe(403);
  });

  it("refuses a slug change", async () => {
    accessMock.mockResolvedValueOnce(editorAccess());
    const res = await slug.PATCH(
      req("/api/contributor/grace-city/slug", "PATCH", { new_slug: "new-handle" }),
      params,
    );
    expect(res.status).toBe(403);
  });
});
