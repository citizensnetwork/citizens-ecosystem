"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { DepartmentTree } from "@/components/org/DepartmentTree";
import type { Department } from "@/types/db";

export default function DepartmentsSettingsPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const [orgId, setOrgId] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDepartments = useCallback(async (id: string) => {
    const res = await fetch(`/api/orgs/${id}/departments`);
    if (res.ok) {
      const json = await res.json();
      setDepartments(json.data ?? []);
    }
  }, []);

  useEffect(() => {
    async function init() {
      // Resolve orgSlug → orgId
      const orgsRes = await fetch("/api/orgs");
      if (!orgsRes.ok) return;
      const orgsJson = await orgsRes.json();
      const match = orgsJson.data?.find(
        (m: { organisations: { slug: string } }) =>
          m.organisations.slug === orgSlug
      );
      if (match) {
        const id = match.org_id;
        setOrgId(id);
        await fetchDepartments(id);
      }
      setLoading(false);
    }
    init();
  }, [orgSlug, fetchDepartments]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-surface-alt" />
        <div className="h-48 rounded bg-surface-alt" />
      </div>
    );
  }

  if (!orgId) {
    return <p className="text-text-secondary">Organisation not found.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Departments</h1>
      <DepartmentTree
        departments={departments}
        orgId={orgId}
        onRefresh={() => fetchDepartments(orgId)}
      />
    </div>
  );
}
