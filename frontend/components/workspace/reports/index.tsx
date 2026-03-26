"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import { SettingsSectionHeader } from "@/components/settings/settings-section";
import SlackConnectionCard, { useSlackIntegration } from "@/components/slack/slack-connection-card";
import { useUserContext } from "@/contexts/user-context";
import { REPORT_TARGET_TYPE, type ReportTargetRow, type ReportWithDetails } from "@/lib/actions/reports/types";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import ReportsList from "./reports-list";

interface WorkspaceReportsProps {
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
}

export default function WorkspaceReports({ workspaceId, slackClientId, slackRedirectUri }: WorkspaceReportsProps) {
  const { email } = useUserContext();
  const { toast } = useToast();

  const { data: slackIntegration } = useSlackIntegration(workspaceId);

  const {
    data: reports,
    isLoading,
    mutate,
    error,
  } = useSWR<ReportWithDetails[]>(`/api/workspaces/${workspaceId}/reports`, swrFetcher);

  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load reports.",
      });
    }
  }, [error, toast]);

  const [togglingReportId, setTogglingReportId] = useState<string | null>(null);

  const isSubscribed = useCallback(
    (report: ReportWithDetails) => report.targets.some((t) => t.type === REPORT_TARGET_TYPE.EMAIL && t.email === email),
    [email]
  );

  const getSlackTarget = useCallback(
    (report: ReportWithDetails): ReportTargetRow | null =>
      report.targets.find((t) => t.type === REPORT_TARGET_TYPE.SLACK) ?? null,
    []
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
          description: subscribe
            ? "You will receive this report at your email."
            : "You will no longer receive this report.",
        });
        await mutate();
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "Failed to update subscription. Please try again.",
        });
      } finally {
        setTogglingReportId(null);
      }
    },
    [workspaceId, email, mutate, toast]
  );

  const handleSlackChannelChange = useCallback(
    async (report: ReportWithDetails, channelId: string | null, channelName: string) => {
      if (!slackIntegration) return;
      setTogglingReportId(report.id);
      try {
        if (channelId) {
          const res = await fetch(`/api/workspaces/${workspaceId}/reports/slack-target`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reportId: report.id,
              integrationId: slackIntegration.id,
              channelId,
              channelName,
            }),
          });

          if (!res.ok) {
            const error = (await res.json().catch(() => ({ error: "Failed to set Slack channel" }))) as {
              error: string;
            };
            throw new Error(error?.error ?? "Failed to set Slack channel");
          }

          toast({
            title: "Slack channel set",
            description: `Reports will be sent to #${channelName}.`,
          });
        } else {
          const res = await fetch(`/api/workspaces/${workspaceId}/reports/slack-target`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportId: report.id }),
          });

          if (!res.ok) {
            const error = (await res.json().catch(() => ({ error: "Failed to remove Slack channel" }))) as {
              error: string;
            };
            throw new Error(error?.error ?? "Failed to remove Slack channel");
          }

          toast({
            title: "Slack channel removed",
            description: "Reports will no longer be sent to Slack.",
          });
        }
        await mutate();
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "Failed to update Slack channel. Please try again.",
        });
      } finally {
        setTogglingReportId(null);
      }
    },
    [workspaceId, slackIntegration, mutate, toast]
  );

  return (
    <>
      <SettingsSectionHeader title="Reports" description="Periodic reports delivered to your email and Slack." />
      <SlackConnectionCard
        workspaceId={workspaceId}
        slackClientId={slackClientId}
        slackRedirectUri={slackRedirectUri}
        returnPath={`/workspace/${workspaceId}?menu=reports`}
      />
      <ReportsList
        reports={reports ?? []}
        isLoading={isLoading}
        email={email}
        workspaceId={workspaceId}
        togglingReportId={togglingReportId}
        isSubscribed={isSubscribed}
        getSlackTarget={getSlackTarget}
        hasSlackIntegration={!!slackIntegration}
        onToggle={handleToggle}
        onSlackChannelChange={handleSlackChannelChange}
      />
    </>
  );
}
