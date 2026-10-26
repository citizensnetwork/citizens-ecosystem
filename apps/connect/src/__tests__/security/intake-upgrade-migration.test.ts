/**
 * Static twin of docs/audit/probes/198_intake_upgrade_existing_account.probe.sql.
 * CI has no database. This pins the grants and the caller guards in the file.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "../..", "supabase/migrations/198_intake_upgrade_existing_account.sql");
const sql = readFileSync(FILE, "utf8").replace(/--[^\n]*/g, "");
const flat = sql.replace(/\s+/g, " ").toLowerCase();

function fn(name: string): { header: string; body: string } {
  const start = new RegExp(`create or replace function public\\.${name}\\s*\\(`, "i").exec(sql);
  expect(start, name).not.toBeNull();
  const from = start!.index;
  const open = /\$([A-Za-z_]*)\$/.exec(sql.slice(from))!;
  const tag = open[0];
  const bodyStart = from + open.index + tag.length;
  const bodyEnd = sql.indexOf(tag, bodyStart);
  return {
    header: sql.slice(from, from + open.index).replace(/\s+/g, " ").toLowerCase(),
    body: sql.slice(bodyStart, bodyEnd).replace(/\s+/g, " ").toLowerCase(),
  };
}

const OWNER = ["preview_intake_upgrade", "decline_intake_upgrade", "confirm_intake_upgrade"];
const SERVICE = ["create_intake_upgrade_request", "resend_intake_upgrade", "intake_upgrade_statuses", "clear_intake_upgrade_storage"];

describe("mig 198 intake upgrade", () => {
  it("the owner view is security_invoker and hides the token", () => {
    expect(flat).toContain("with (security_invoker = on)");
    expect(flat).toContain("revoke all on public.my_intake_upgrade from public, anon");
    expect(flat).toContain("grant select on public.my_intake_upgrade to authenticated");
    const view = flat.slice(flat.indexOf("create or replace view public.my_intake_upgrade"), flat.indexOf("comment on view"));
    expect(view).not.toContain("token_hash");
    expect(view).not.toContain("contact_email");
  });

  it("the table is not writable by authenticated, and the token column is not selectable", () => {
    expect(flat).toContain("enable row level security");
    expect(flat).toContain("revoke all on table public.intake_upgrade_requests from public, anon, authenticated");
    expect(flat).not.toMatch(/grant (insert|update|delete)[^;]*intake_upgrade_requests to authenticated/);
    const grant = flat.slice(flat.indexOf("grant select ("), flat.indexOf(") on public.intake_upgrade_requests to authenticated"));
    expect(grant).not.toContain("token_hash");
    expect(grant).not.toContain("contact_email");
  });

  it("owner functions are security definer, search_path empty, and refuse a null uid", () => {
    for (const name of OWNER) {
      const f = fn(name);
      expect(f.header, name).toContain("security definer");
      expect(f.header, name).toMatch(/set search_path to ''/);
      if (name === "confirm_intake_upgrade") {
        expect(f.body, name).toContain("v_uid uuid := auth.uid()");
        expect(f.body, name).toContain("if v_uid is null then");
      } else {
        expect(f.body, name).toContain("auth.uid() is null");
      }
      expect(flat).toContain(`revoke all on function public.${name}(text) from public, anon`);
      expect(flat).toContain(`grant execute on function public.${name}(text) to authenticated`);
    }
  });

  it("sheet functions refuse any caller that has a uid, and are not granted to clients", () => {
    for (const name of SERVICE) {
      const f = fn(name);
      expect(f.header, name).toContain("security definer");
      expect(f.header, name).toMatch(/set search_path to ''/);
      expect(f.body, name).toContain("auth.uid() is not null or coalesce(auth.role(), '') <> 'service_role'");
      expect(flat, name).toContain(`revoke all on function public.${name}`);
    }
    // the revoke line contains the name; the grant to service_role is the only execute grant
    for (const name of SERVICE) {
      const grants = flat.match(new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to ([a-z_, ]+);`, "g")) ?? [];
      expect(grants.length, name).toBeGreaterThan(0);
      for (const grant of grants) expect(grant, name).toContain("service_role");
      expect(grants.join(" "), name).not.toMatch(/to (public|anon|authenticated)/);
    }
  });

  it("the internal flag helper is not granted to clients", () => {
    const f = fn("intake_upgrade_flag_admin");
    expect(f.header).toMatch(/set search_path to ''/);
    expect(f.body).toContain("auth.uid() is null");
    expect(flat).toContain("revoke all on function public.intake_upgrade_flag_admin(uuid, text) from public, anon, authenticated");
    expect(flat).not.toContain("grant execute on function public.intake_upgrade_flag_admin");
  });
});
