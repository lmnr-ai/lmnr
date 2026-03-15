"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import { SettingsSectionHeader } from "@/components/settings/settings-section";
import SlackConnectionCard, { useSlackIntegration } from "@/components/slack/slack-connection-card";
import { useUserContext } from "@/contexts/user-context";
import { REPORT_TARGET_TYPE, type ReportWithDetails } from "@/lib/actions/reports/types";
import { type SlackChannel } from "@/lib/actions/slack";
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

  const {
    data: reports,
    isLoading,
    mutate,
    error,
  } = useSWR<ReportWithDetails[]>(`/api/workspaces/${workspaceId}/reports`, swrFetcher);

  const { data: slackIntegration } = useSlackIntegration(workspaceId);

  const { data: channels } = useSWR<SlackChannel[]>(
    slackIntegration ? `/api/workspaces/${workspaceId}/slack/channels` : null,
    swrFetcher
  );

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

  const isEmailSubscribed = useCallback(
    (report: ReportWithDetails) => report.targets.some((t) => t.type === REPORT_TARGET_TYPE.EMAIL && t.email === email),
    [email]
  );

  const slackTarget = useCallback(
    (report: ReportWithDetails) => report.targets.find((t) => t.type === REPORT_TARGET_TYPE.SLACK),
    []
  );

  const handleEmailToggle = useCallback(
    async (report: ReportWithDetails, subscribe: boolean) => {
      setTogglingReportId(report.id);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/reports`, {
          method: subscribe ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId: report.id, email, targetType: REPORT_TARGET_TYPE.EMAIL }),
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

  const handleSlackSubscribe = useCallback(
    async (report: ReportWithDetails, channelId: string): Promise<boolean> => {
      if (!slackIntegration) return false;
      setTogglingReportId(report.id);
      try {
        const channel = channels?.find((ch) => ch.id === channelId);
        const res = await fetch(`/api/workspaces/${workspaceId}/reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportId: report.id,
            targetType: REPORT_TARGET_TYPE.SLACK,
            integrationId: slackIntegration.id,
            channelId,
            channelName: channel?.name ?? "",
          }),
        });

        if (!res.ok) {
          const error = (await res.json().catch(() => ({ error: "Failed to update" }))) as { error: string };
          throw new Error(error?.error ?? "Failed to subscribe to Slack");
        }

        toast({
          title: "Slack subscription added",
          description: `Reports will be sent to #${channel?.name ?? channelId}.`,
        });
        await mutate();
        return true;
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "Failed to subscribe to Slack. Please try again.",
        });
        return false;
      } finally {
        setTogglingReportId(null);
      }
    },
    [workspaceId, slackIntegration, channels, mutate, toast]
  );

  const handleSlackUnsubscribe = useCallback(
    async (report: ReportWithDetails) => {
      setTogglingReportId(report.id);
      try {
        const target = slackTarget(report);
        if (!target) return;
        const res = await fetch(`/api/workspaces/${workspaceId}/reports`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportId: report.id,
            targetType: REPORT_TARGET_TYPE.SLACK,
            channelId: target.channelId,
          }),
        });

        if (!res.ok) {
          const error = (await res.json().catch(() => ({ error: "Failed to update" }))) as { error: string };
          throw new Error(error?.error ?? "Failed to unsubscribe from Slack");
        }

        toast({
          title: "Slack subscription removed",
          description: "Reports will no longer be sent to this Slack channel.",
        });
        await mutate();
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "Failed to unsubscribe from Slack. Please try again.",
        });
      } finally {
        setTogglingReportId(null);
      }
    },
    [workspaceId, slackTarget, mutate, toast]
  );

  return (
    <>
      <SettingsSectionHeader title="Reports" description="Periodic reports delivered to your email or Slack." />
      <ReportsList
        reports={reports ?? []}
        isLoading={isLoading}
        email={email}
        togglingReportId={togglingReportId}
        isEmailSubscribed={isEmailSubscribed}
        slackTarget={slackTarget}
        slackIntegration={slackIntegration ?? null}
        channels={channels ?? []}
        onEmailToggle={handleEmailToggle}
        onSlackSubscribe={handleSlackSubscribe}
        onSlackUnsubscribe={handleSlackUnsubscribe}
      />
      {!slackIntegration && (
        <SlackConnectionCard
          workspaceId={workspaceId}
          slackClientId={slackClientId}
          slackRedirectUri={slackRedirectUri}
          returnPath={`/workspace/${workspaceId}?tab=reports`}
        />
      )}
    </>
  );
}
