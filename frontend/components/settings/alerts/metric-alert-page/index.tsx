"use client";

import { useState } from "react";
import useSWR from "swr";

import Header from "@/components/ui/header";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectContext } from "@/contexts/project-context";
import { useUserContext } from "@/contexts/user-context";
import { type MetricAlertDetail } from "@/lib/actions/alerts/metric-rule";
import { swrFetcher } from "@/lib/api/fetch-api";

import { REFRESH_MS } from "../metric-alerts/constants";
import MetricAlertSheet from "../metric-alerts/metric-alert-sheet";
import StatusPill from "../metric-alerts/status-pill";
import { useMetricAlertActions } from "../metric-alerts/use-metric-alert-actions";
import { useRuleCheck } from "../metric-alerts/use-rule-requests";
import { useSlackAvailable } from "../metric-alerts/use-slack-available";
import { alertStatus, cadenceLine, conditionSummary, isSnoozed } from "../metric-alerts/utils";
import AlertActions from "./alert-actions";
import AlertChart from "./alert-chart";
import IncidentHistory from "./incident-history";
import { currentTracesHref, incidentTracesHref } from "./traces-href";

export default function MetricAlertPage({ projectId, alertId }: { projectId: string; alertId: string }) {
  const { workspace, settingsHref } = useProjectContext();
  const { email } = useUserContext();
  const slackAvailable = useSlackAvailable();

  const {
    data: alert,
    error,
    mutate,
  } = useSWR<MetricAlertDetail>(`/api/projects/${projectId}/alerts/metric/${alertId}`, swrFetcher, {
    refreshInterval: REFRESH_MS,
  });
  const { pendingIds, setMuted, snooze } = useMetricAlertActions(projectId, mutate);
  const [editing, setEditing] = useState(false);

  // Asked on its own: the replay behind the chart can be slow or fail.
  const { cadence } = useRuleCheck(projectId, alert?.rule ?? null, { refreshMs: REFRESH_MS });
  const openIncident = alert?.incidents.find((incident) => !incident.resolvedAt);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header path={[{ name: "Alerts", href: settingsHref("alerts") }, { name: alert?.name ?? "Alert" }]} />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 pb-16">
          {error ? (
            <p className="text-sm text-muted-foreground">This alert could not be loaded. It may have been deleted.</p>
          ) : !alert ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-xl font-semibold tracking-tight">{alert.name}</h1>
                    <StatusPill status={alertStatus(alert)} />
                  </div>
                  <p className="text-sm text-muted-foreground">{conditionSummary(alert.rule)}</p>
                  <p className="text-xs text-muted-foreground">
                    {cadence && cadenceLine(cadence)}
                    {isSnoozed(alert.rule) && " Snoozed: no messages are sent, the rule is still checked."}
                    {alert.rule.disabled && " Muted: no messages are sent, the rule is still checked."}
                  </p>
                </div>
                <AlertActions
                  alert={alert}
                  tracesHref={
                    openIncident
                      ? incidentTracesHref(projectId, alert.rule, openIncident, cadence)
                      : currentTracesHref(projectId)
                  }
                  isPending={pendingIds.has(alert.id)}
                  onSnooze={(until) => snooze(alert, until)}
                  onMute={(muted) => setMuted(alert, muted)}
                  onEdit={() => setEditing(true)}
                />
              </div>
              <AlertChart alert={alert} />
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">Incident history</h2>
                <IncidentHistory
                  projectId={projectId}
                  rule={alert.rule}
                  incidents={alert.incidents}
                  cadence={cadence}
                />
              </section>
              {workspace && (
                <MetricAlertSheet
                  projectId={projectId}
                  workspaceId={workspace.id}
                  userEmail={email}
                  slackAvailable={slackAvailable}
                  alert={alert}
                  open={editing}
                  onOpenChange={setEditing}
                  onSaved={() => mutate()}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
