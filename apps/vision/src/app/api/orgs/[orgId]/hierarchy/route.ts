import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import {
  findAncestors,
  findDescendants,
  findSiblings,
  type OrgNode,
} from "@/lib/orgs/hierarchy";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/orgs/[orgId]/hierarchy
 *
 * Returns the org's position in the hierarchy: self, ancestors (nearest
 * first), siblings, and children. All rows are fetched through the
 * standard authenticated client so RLS already restricts the response
 * to orgs the caller can read.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;

  if (!isValidUUID(orgId)) {
    return NextResponse.json({ error: "Invalid org ID" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the target org first so we know whether the caller can see it
  // and what its parent is. RLS makes this return null for outsiders.
  const { data: self, error: selfError } = await supabase
    .from("organisations")
    .select("id, name, slug, parent_org_id")
    .eq("id", orgId)
    .maybeSingle();

  if (selfError) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  if (!self) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  // Fetch every org the caller can read in one shot and traverse in JS.
  //
  // Scaling note: this is appropriate while a caller's visible-org count
  // stays modest (typical tenants sit well under 1k orgs with shallow
  // hierarchies). If a deployment grows beyond that — e.g. a platform
  // admin with visibility over thousands of tenants, or very deep
  // trees — switch to the SECURITY DEFINER SQL helpers
  // (get_org_ancestors / get_org_descendants) introduced in migration
  // 013 and paginate children. Tracked as a TODO for the next phase
  // that wires those helpers into RLS.
  const { data: visible, error: visibleError } = await supabase
    .from("organisations")
    .select("id, name, slug, parent_org_id");

  if (visibleError) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  const orgs: OrgNode[] = visible ?? [];
  const ancestors = findAncestors(orgs, orgId);
  const descendants = findDescendants(orgs, orgId);
  const children = descendants.filter(
    (o) => (o.parent_org_id ?? null) === orgId,
  );
  const siblings = findSiblings(orgs, orgId);

  return NextResponse.json({
    self,
    ancestors,
    siblings,
    children,
    descendants,
  });
}
