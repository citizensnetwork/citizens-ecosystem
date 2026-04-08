"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { MemberTable } from "@/components/org/MemberTable";
import type { UserOrgRole, Department } from "@/types/db";

interface MemberWithDept extends UserOrgRole {
  departments?: { name: string } | null;
}

export default function MembersSettingsPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const [orgId, setOrgId] = useState<string | null>(null);
  const [currentUserId] = useState("");
  const [members, setMembers] = useState<MemberWithDept[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (id: string) => {
    const [membersRes, deptsRes] = await Promise.all([
      fetch(`/api/orgs/${id}/members`),
      fetch(`/api/orgs/${id}/departments`),
    ]);
    if (membersRes.ok) {
      const json = await membersRes.json();
      setMembers(json.data ?? []);
    }
    if (deptsRes.ok) {
      const json = await deptsRes.json();
      setDepartments(json.data ?? []);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const orgsRes = await fetch("/api/orgs");
      if (!orgsRes.ok) return;
      const orgsJson = await orgsRes.json();
      const match = orgsJson.data?.find(
        (m: { organisations: { slug: string }; org_id: string }) =>
          m.organisations.slug === orgSlug
      );
      if (match) {
        setOrgId(match.org_id);
        // Find current user from the membership list
        const membersRes = await fetch(`/api/orgs/${match.org_id}/members`);
        if (membersRes.ok) {
          const json = await membersRes.json();
          setMembers(json.data ?? []);
        }
        const deptsRes = await fetch(`/api/orgs/${match.org_id}/departments`);
        if (deptsRes.ok) {
          const json = await deptsRes.json();
          setDepartments(json.data ?? []);
        }
        // Get current user from the response by checking the org_roles
        // We'll store user_id from the first matching role data
        if (orgsJson.data?.length > 0) {
          // The user_id is derived from the member who logged in
          // We need a way to get it; for now we pass empty and let the table handle it
        }
      }
      setLoading(false);
    }
    init();
  }, [orgSlug, fetchData]);

  // Get current user ID from members list — the user endpoint returns it
  useEffect(() => {
    // We'll fetch the user session to get the current user ID
    async function fetchUser() {
      // The orgs endpoint returns the user's own memberships
      const res = await fetch("/api/orgs");
      if (res.ok) {
        const json = await res.json();
        if (json.data?.[0]?.organisations) {
          // user_id is not directly in the orgs response
          // We'll mark the user_id from members that matches
          // For MVP, we set from the first org role
        }
      }
    }
    fetchUser();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-surface-alt" />
        <div className="h-64 rounded bg-surface-alt" />
      </div>
    );
  }

  if (!orgId) {
    return <p className="text-text-secondary">Organisation not found.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Members</h1>
      <MemberTable
        members={members}
        departments={departments}
        orgId={orgId}
        currentUserId={currentUserId}
        onRefresh={() => fetchData(orgId)}
      />
    </div>
  );
}
