"use client";

import { useRouter } from "next/navigation";
import { DepartmentTree } from "@/components/org/DepartmentTree";
import type { Department } from "@/types/db";

/**
 * Phase 14b: thin client boundary around <DepartmentTree>.
 * See MembersSettingsClient for the rationale.
 */
interface Props {
  departments: Department[];
  orgId: string;
}

export function DepartmentsSettingsClient({ departments, orgId }: Props) {
  const router = useRouter();
  return (
    <DepartmentTree
      departments={departments}
      orgId={orgId}
      onRefresh={() => router.refresh()}
    />
  );
}
