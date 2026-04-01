"use client";

import { isEmpty, isNil } from "lodash";
import { Pen } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import TargetChips from "@/components/settings/alerts/target-chips";
import {
  SettingsSection,
  SettingsSectionHeader,
  SettingsTable,
  SettingsTableRow,
} from "@/components/settings/settings-section";
import SlackConnectionCard, { useSlackIntegration } from "@/components/slack/slack-connection-card";
import { Button } from "@/components/ui/button";
import { useUserContext } from "@/contexts/user-context";
import { type ReportWithDetails } from "@/lib/actions/reports/types";
import { swrFetcher } from "@/lib/utils";

import ManageReportSheet from "./manage-report-sheet";
import { formatSchedule } from "./utils";

interface WorkspaceReportsProps {
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
}

export default function WorkspaceReports({ workspaceId, slackClientId, slackRedirectUri }: WorkspaceReportsProps) {
  const { email: userEmail } = useUserContext();

  const { data: slackIntegration } = useSlackIntegration(workspaceId);

  const {
    data: reports,
    isLoading,
    mutate,
  } = useSWR<ReportWithDetails[]>(`/api/workspaces/${workspaceId}/reports`, swrFetcher);

  const [editTarget, setEditTarget] = useState<ReportWithDetails | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <SettingsSection>
      <SettingsSectionHeader title="Reports" description="Periodic reports delivered to your email and Slack." />

      <SlackConnectionCard
        workspaceId={workspaceId}
        slackClientId={slackClientId}
        slackRedirectUri={slackRedirectUri}
        returnPath={`/workspace/${workspaceId}?menu=reports`}
      />

      <SettingsTable
        isLoading={isLoading}
        isEmpty={isNil(reports) || isEmpty(reports)}
        emptyMessage="No reports available yet. Reports will appear here once they are configured for your workspace."
        headers={["Report", "Schedule", "Send to", ""]}
        colSpan={4}
      >
        {reports?.map((report) => {
          // Only show the current user's own email target + all Slack targets
          const visibleTargets = report.targets.filter((t) => t.type !== "EMAIL" || t.email === userEmail);
          return (
            <SettingsTableRow key={report.id}>
              <td className="px-4 text-sm font-medium max-w-48">
                <span title={report.label} className="block truncate">
                  {report.label}
                </span>
              </td>
              <td className="px-4 text-xs text-muted-foreground whitespace-nowrap">
                {formatSchedule(report.schedule)}
              </td>
              <td className="px-4">
                <TargetChips targets={visibleTargets} />
              </td>
              <td className="px-4 w-1/10">
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditTarget(report);
                      setSheetOpen(true);
                    }}
                  >
                    <Pen size={14} className="text-muted-foreground" />
                  </Button>
                </div>
              </td>
            </SettingsTableRow>
          );
        })}
      </SettingsTable>

      <ManageReportSheet
        workspaceId={workspaceId}
        integrationId={slackIntegration?.id}
        report={editTarget}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditTarget(null);
        }}
        onSaved={() => {
          mutate();
          setSheetOpen(false);
          setEditTarget(null);
        }}
        userEmail={userEmail}
      />
    </SettingsSection>
  );
}
