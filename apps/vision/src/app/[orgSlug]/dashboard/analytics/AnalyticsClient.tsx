"use client";

import { useState } from "react";
import { ComparisonView } from "@/components/dashboard/ComparisonView";
import { RegressionChart } from "@/components/dashboard/RegressionChart";
import { ExportPanel } from "@/components/dashboard/ExportPanel";
import { ScheduledReports } from "@/components/dashboard/ScheduledReports";

interface AnalyticsClientProps {
  orgId: string;
  orgSlug: string;
  departments: { id: string; name: string }[];
  isAdmin: boolean;
}

type Tab = "comparison" | "trends" | "export" | "reports";

export function AnalyticsClient({
  orgId,
  orgSlug,
  departments,
  isAdmin,
}: AnalyticsClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>("comparison");

  const tabs: { key: Tab; label: string }[] = [
    { key: "comparison", label: "Period Comparison" },
    { key: "trends", label: "Trend Regression" },
    { key: "export", label: "Export" },
    { key: "reports", label: "Scheduled Reports" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Analytics & Export</h1>
        <a
          href={`/${orgSlug}/dashboard`}
          className="text-sm text-[#4a90d9] hover:underline"
        >
          ← Back to Dashboard
        </a>
      </div>

      {/* Tab navigation */}
      <nav className="flex gap-1 rounded-lg bg-[#1a1a2e] p-1" aria-label="Analytics tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-[#4a90d9] text-white"
                : "text-gray-400 hover:text-white"
            }`}
            aria-selected={activeTab === tab.key}
            role="tab"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div role="tabpanel">
        {activeTab === "comparison" && (
          <ComparisonView orgId={orgId} departments={departments} />
        )}
        {activeTab === "trends" && <RegressionChart orgId={orgId} />}
        {activeTab === "export" && <ExportPanel orgId={orgId} />}
        {activeTab === "reports" && (
          <ScheduledReports orgId={orgId} isAdmin={isAdmin} />
        )}
      </div>
    </div>
  );
}
