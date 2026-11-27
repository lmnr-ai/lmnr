import { useCallback } from "react";

import { type MetricAlert, METRIC_ALERT_TYPE } from "@/lib/actions/alerts/metric-rule";
import { ALERT_TARGET_TYPE } from "@/lib/actions/alerts/types";
import { fetchApi } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

import { toRule } from "./form-rule";
import { type MetricAlertFormValues } from "./types";

interface SaveOptions {
  projectId: string;
  userEmail: string;
  integrationId?: string | null;
  /** The rule being edited, or nothing when creating. */
  alert?: MetricAlert | null;
  onSaved: () => void;
}

const targetsOf = (values: MetricAlertFormValues, { integrationId, alert, userEmail }: SaveOptions) => {
  const slack = integrationId
    ? values.slackChannels.map((channel) => ({
        type: ALERT_TARGET_TYPE.SLACK,
        integrationId,
        channelId: channel.id,
        channelName: channel.name,
      }))
    : // Slack targets the form could not show, because Slack is disconnected, are kept.
      (alert?.targets ?? [])
        .filter((target) => target.type === ALERT_TARGET_TYPE.SLACK)
        .map((target) => ({
          type: ALERT_TARGET_TYPE.SLACK,
          integrationId: target.integrationId ?? undefined,
          channelId: target.channelId ?? undefined,
          channelName: target.channelName ?? undefined,
        }));
  const email = values.emailEnabled && userEmail ? [{ type: ALERT_TARGET_TYPE.EMAIL, email: userEmail }] : [];
  return [...slack, ...email];
};

/** Creates or updates a metric alert. Resolves to whether it was saved. */
export const useSaveMetricAlert = (options: SaveOptions) => {
  const { toast } = useToast();
  const { projectId, alert, onSaved } = options;

  return useCallback(
    async (values: MetricAlertFormValues): Promise<boolean> => {
      const name = values.name.trim();
      const { error } = await fetchApi(`/api/projects/${projectId}/alerts${alert ? `/${alert.id}` : ""}`, {
        method: alert ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(alert && { action: "update" }),
          name,
          type: METRIC_ALERT_TYPE,
          targets: targetsOf(values, options),
          metadata: toRule(values),
        }),
      });
      if (error !== null) {
        toast({ variant: "destructive", title: alert ? "Alert not saved" : "Alert not created", description: error });
        return false;
      }
      toast({ title: alert ? "Alert updated" : "Alert created", description: `"${name}" is being checked.` });
      track("alerts", alert ? "updated" : "created", {
        type: METRIC_ALERT_TYPE,
        metric: values.metric,
        condition: values.conditionType,
        has_slack: values.slackChannels.length > 0,
        has_email: values.emailEnabled,
      });
      onSaved();
      return true;
    },
    // `options` is rebuilt every render; its fields are what matter.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [projectId, alert, onSaved, options.integrationId, options.userEmail, toast]
  );
};
