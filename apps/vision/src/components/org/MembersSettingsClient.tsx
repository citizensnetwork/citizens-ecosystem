"use client";

import { useRouter } from "next/navigation";
import { MemberTable } from "@/components/org/MemberTable";
import type { UserOrgRole, Department } from "@/types/db";

/**
 * Phase 14b: thin client boundary around <MemberTable>.
 *
 * The settings page is now a Server Component that does the org
 * resolution and initial data fetch. When the table triggers a
 * mutation (invite, role change, department move, remove), we
 * re-run the server component via router.refresh() instead of
 * re-fetching on the client. This gives us:
 *   - one source of truth (server RLS-filtered query)
 *   - no client-side API round-trip just to re-paint
 *   - cache tags (future) invalidate automatically when the
 *     server action flows through revalidateTag()
 */
interface MemberWithDept extends UserOrgRole {
  departments?: { name: string } | null;
}

interface Props {
  members: MemberWithDept[];
  departments: Department[];
  orgId: string;
  currentUserId: string;
}

export function MembersSettingsClient({
  members,
  departments,
  orgId,
  currentUserId,
}: Props) {
  const router = useRouter();
  return (
    <MemberTable
      members={members}
      departments={departments}
      orgId={orgId}
      currentUserId={currentUserId}
      onRefresh={() => router.refresh()}
    />
  );
}
