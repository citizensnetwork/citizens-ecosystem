// Stage A item 7 — unit tests for the unified contributor mutation recorder.
//
// Covers both branches:
//  - Owner: writes activity_log with actor_role='contributor'.
//  - Admin-with-grant: delegates to logAdminOnBehalfAction (activity_log row
//    with actor_role='admin' + notification of type 'admin_on_behalf_action').

import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordContributorMutation } from "@/lib/dashboard/activity";
import type { SupabaseClient } from "@supabase/supabase-js";

const CONTRIB = "22222222-2222-2222-2222-222222222222";
const ACTOR = "11111111-1111-1111-1111-111111111111";
const ENTITY = "33333333-3333-3333-3333-333333333333";

function makeSupabase() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as unknown as SupabaseClient, from, insert };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("recordContributorMutation", () => {
  it("owner path writes activity_log row with actor_role='contributor'", async () => {
    const { client, from, insert } = makeSupabase();

    await recordContributorMutation(client, {
      handle: "test-slug",
      access: { hasAccess: true, isOwner: true, isAdminWithAccess: false, contributorId: CONTRIB },
      actorId: ACTOR,
      action: "broadcast_sent",
      entityType: "broadcast",
      entityId: ENTITY,
      metadata: { x: 1 },
    });

    expect(from).toHaveBeenCalledWith("activity_log");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      contributor_id: CONTRIB,
      actor_id: ACTOR,
      actor_role: "contributor",
      action: "broadcast_sent",
      entity_type: "broadcast",
      entity_id: ENTITY,
      metadata: { x: 1 },
    });
  });

  it("admin-with-grant path writes activity_log (actor_role='admin') AND notification", async () => {
    // For the admin branch we capture every insert across all from() calls
    // to assert both the activity_log and notifications writes happen.
    const inserts: Array<{ table: string; payload: unknown }> = [];
    const client = {
      from: (table: string) => ({
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient;

    await recordContributorMutation(client, {
      handle: "test-slug",
      access: { hasAccess: true, isOwner: false, isAdminWithAccess: true, contributorId: CONTRIB },
      actorId: ACTOR,
      action: "keyword_added",
      entityType: "keyword",
      entityId: ENTITY,
    });

    const log = inserts.find((i) => i.table === "activity_log");
    const note = inserts.find((i) => i.table === "notifications");

    expect(log).toBeDefined();
    expect((log!.payload as Record<string, unknown>).actor_role).toBe("admin");
    expect((log!.payload as Record<string, unknown>).contributor_id).toBe(CONTRIB);
    expect((log!.payload as Record<string, unknown>).actor_id).toBe(ACTOR);

    expect(note).toBeDefined();
    expect((note!.payload as Record<string, unknown>).type).toBe("admin_on_behalf_action");
    expect((note!.payload as Record<string, unknown>).user_id).toBe(CONTRIB);
    const data = (note!.payload as Record<string, unknown>).data as Record<string, unknown>;
    expect(data.url).toBe("/c/test-slug/dashboard/settings");
  });

  it("does not throw if activity_log insert fails (best-effort)", async () => {
    const errClient = {
      from: () => ({
        insert: () => Promise.resolve({ error: { message: "DB down" } }),
      }),
    } as unknown as SupabaseClient;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordContributorMutation(errClient, {
        handle: "test-slug",
        access: { hasAccess: true, isOwner: true, isAdminWithAccess: false, contributorId: CONTRIB },
        actorId: ACTOR,
        action: "task_created",
        entityType: "planning_task",
        entityId: ENTITY,
      }),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalled();
  });
});
