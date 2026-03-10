"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import { SettingsSectionHeader } from "@/components/settings/settings-section";
import { useUserContext } from "@/contexts/user-context";
import { type ReportWithDetails } from "@/lib/actions/reports/types";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import ReportsList from "./reports-list";

interface WorkspaceReportsProps {
  workspaceId: string;
}

export default function WorkspaceReports({ workspaceId }: WorkspaceReportsProps) {
  const { email } = useUserContext();
  const { toast } = useToast();

  const {
    data: reports,
    isLoading,
    mutate,
    error,
  } = useSWR<ReportWithDetails[]>(`/api/workspaces/${workspaceId}/reports`, swrFetcher);

  useEffect(() => {
    if (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load reports.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const [togglingReportId, setTogglingReportId] = useState<string | null>(null);

  const isSubscribed = useCallback(
    (report: ReportWithDetails) => report.targets.some((t) => t.type === "email" && t.email === email),
    [email]
  );

  const handleToggle = useCallback(
    async (report: ReportWithDetails, subscribe: boolean) => {
      setTogglingReportId(report.id);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/reports`, {
          method: subscribe ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId: report.id, email }),
        });

        if (!res.ok) {
          const error = (await res.json().catch(() => ({ error: "Failed to update" }))) as { error: string };
          throw new Error(error?.error ?? "Failed to update subscription");
        }

        toast({
          title: subscribe ? "Subscribed to report" : "Unsubscribed from report",
        });
        await mutate();
      } catch (e) {
        toast({
          title: "Error updating subscription",
          variant: "destructive",
          description: e instanceof Error ? e.message : "Failed to update subscription",
        });
      } finally {
        setTogglingReportId(null);
      }
    },
    [workspaceId, email, mutate, toast]
  );

  return (
    <>
      <SettingsSectionHeader title="Reports" description="Periodic reports delivered to your email." />
      <ReportsList
        reports={reports ?? []}
        isLoading={isLoading}
        email={email}
        togglingReportId={togglingReportId}
        isSubscribed={isSubscribed}
        onToggle={handleToggle}
      />
    </>
  );
}
