"use client";

import { useState } from "react";
import { PartnershipManager } from "@/components/dashboard/PartnershipManager";
import { CrossOrgDashboard } from "@/components/dashboard/CrossOrgDashboard";
import { CommunityView } from "@/components/dashboard/CommunityView";
import { HierarchyTree } from "@/components/dashboard/HierarchyTree";

interface FederationClientProps {
  orgId: string;
  isAdmin: boolean;
}

type FederationTab = "hierarchy" | "partners" | "cross-org" | "community";

export default function FederationClient({
  orgId,
  isAdmin,
}: FederationClientProps) {
  const [activeTab, setActiveTab] = useState<FederationTab>("hierarchy");

  const tabs: { key: FederationTab; label: string }[] = [
    { key: "hierarchy", label: "Hierarchy" },
    { key: "partners", label: "Partnerships" },
    { key: "cross-org", label: "Cross-Org Metrics" },
    { key: "community", label: "Community" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">
          Multi-Org Federation
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Manage partnerships, view cross-organisation metrics, and community
          aggregates.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-[#1a1a2e] p-1" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-[#4a90d9] text-white"
                : "text-gray-400 hover:text-white"
            }`}
            role="tab"
            aria-selected={activeTab === tab.key}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "hierarchy" && <HierarchyTree orgId={orgId} />}

      {activeTab === "partners" && (
        <PartnershipManager orgId={orgId} isAdmin={isAdmin} />
      )}

      {activeTab === "cross-org" && <CrossOrgDashboard orgId={orgId} />}

      {activeTab === "community" && <CommunityView orgId={orgId} />}
    </div>
  );
}
