"use client";

import MetricAlertSheet from "@/components/settings/alerts/metric-alerts/metric-alert-sheet";
import { type MetricAlertPreset } from "@/components/settings/alerts/metric-alerts/metric-alert-sheet/types";
import { useSlackAvailable } from "@/components/settings/alerts/metric-alerts/use-slack-available";
import { useProjectContext } from "@/contexts/project-context";
import { useUserContext } from "@/contexts/user-context";

interface ChartAlertSheetProps {
  projectId: string;
  preset: MetricAlertPreset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The metric alert sheet, started from a dashboard chart with its metric filled in. */
export default function ChartAlertSheet({ projectId, preset, open, onOpenChange }: ChartAlertSheetProps) {
  const { workspace } = useProjectContext();
  const { email } = useUserContext();
  const slackAvailable = useSlackAvailable();

  if (!workspace) return null;

  return (
    <MetricAlertSheet
      projectId={projectId}
      workspaceId={workspace.id}
      userEmail={email}
      slackAvailable={slackAvailable}
      preset={preset}
      open={open}
      onOpenChange={onOpenChange}
      onSaved={() => {}}
    />
  );
}
