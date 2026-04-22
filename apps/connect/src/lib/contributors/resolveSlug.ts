// Shared server helper — resolves a contributor vanity slug to a
// lightweight profile row. Extracted out of the /c/[slug] page so it
// can be imported by both the standalone page and the @panel drawer
// intercept without tripping Next.js 15's "no arbitrary exports from
// page files" rule.
//
// Wrapped in React `cache()` so if Next renders both the page shell
// and the drawer in the same request they share one DB round-trip.
// Only resolves approved contributors — pending / rejected profiles
// are hidden from the public registry.

import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type ContributorSlugLookup = {
  id: string;
  full_name: string | null;
  role: string;
  contributor_status: string | null;
  bio: string | null;
};

export const resolveContributorSlug = cache(
  async (slug: string): Promise<ContributorSlugLookup | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role, contributor_status, bio")
      .eq("contributor_slug", slug)
      .eq("role", "contributor")
      .eq("contributor_status", "approved")
      .maybeSingle<ContributorSlugLookup>();
    return data;
  },
);
