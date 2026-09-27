// @vitest-environment node
/**
 * LIVE check: the public anon key cannot read private profiles columns.
 *
 * Runs only when NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY are
 * set (e.g. a local .env), so CI — which has no Supabase credentials — skips
 * it. It reads nothing: every request uses `limit=0`, so a pass or a fail
 * proves the privilege without pulling a single row of personal data.
 *
 * The static twin (always on) is profiles-column-privacy.test.ts.
 */
import { describe, it, expect } from "vitest";
import { PRIVATE_PROFILE_COLUMNS } from "./profileColumns";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Still granted by mig 176 so pre-174 production code keeps working; mig 177
 * revokes them once the new code is deployed. EMPTY THIS LIST in the change
 * that applies 177 — from then on they must be denied like the rest.
 */
const TRANSITIONAL_UNTIL_177 = new Set<string>([
  "force_reauth_at",
  "bio_setup_required",
  "terms_accepted_at",
  "location_sharing",
  "notification_prefs",
]);

async function anonGet(path: string): Promise<{ status: number; code?: string }> {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}` },
  });
  const body = (await res.json().catch(() => ({}))) as { code?: string };
  return { status: res.status, code: body.code };
}

describe.skipIf(!URL_BASE || !ANON_KEY)("profiles column privacy — live anon probe", () => {
  it("anon can still read the public identity columns", async () => {
    const r = await anonGet("profiles?select=id,full_name,contributor_slug&limit=0");
    expect(r.status).toBe(200);
  });

  it.each(PRIVATE_PROFILE_COLUMNS.filter((c) => !TRANSITIONAL_UNTIL_177.has(c)))(
    "anon is denied profiles.%s",
    async (column) => {
      const r = await anonGet(`profiles?select=${column}&limit=0`);
      expect([401, 403]).toContain(r.status);
      expect(r.code).toBe("42501");
    },
  );

  it("anon cannot select * from profiles", async () => {
    const r = await anonGet("profiles?select=*&limit=0");
    expect([401, 403]).toContain(r.status);
  });

  it("anon cannot filter on a private column either", async () => {
    const r = await anonGet("profiles?select=id&email=ilike.*&limit=0");
    expect([401, 403]).toContain(r.status);
  });

  it("anon cannot call the own-row private reader", async () => {
    const r = await anonGet("rpc/get_my_profile_private");
    expect([401, 403]).toContain(r.status);
  });
});
