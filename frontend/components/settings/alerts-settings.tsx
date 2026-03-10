"use client";

import { Loader2, Send, Trash2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import { type EventsStatsDataPoint } from "@/components/signal/store";
import SlackConnectButton from "@/components/slack/slack-connect-button";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { type AlertWithDetails } from "@/lib/actions/alerts/types";
import { type SignalRow } from "@/lib/actions/signals";
import { type SlackChannel } from "@/lib/actions/slack";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, swrFetcher } from "@/lib/utils";

import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "./settings-section";

interface AlertsSettingsProps {
  projectId: string;
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
}

interface SlackIntegrationInfo {
  id: string;
  teamName: string | null;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const CHART_FIELDS = ["count"] as const;

export default function AlertsSettings({
  projectId,
  workspaceId,
  slackClientId,
  slackRedirectUri,
}: AlertsSettingsProps) {
  const { toast } = useToast();

  const { data: slackIntegration, isLoading: isLoadingSlack } = useSWR<SlackIntegrationInfo | null>(
    `/api/workspaces/${workspaceId}/slack`,
    swrFetcher
  );

  const {
    data: alertsList,
    isLoading: isLoadingAlerts,
    mutate: mutateAlerts,
  } = useSWR<AlertWithDetails[]>(`/api/projects/${projectId}/alerts`, swrFetcher);

  const [deleteTarget, setDeleteTarget] = useState<AlertWithDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/alerts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: deleteTarget.id }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({ error: "Failed to delete" }))) as { error: string };
        throw new Error(error?.error ?? "Failed to delete alert");
      }

      toast({ title: "Alert deleted" });
      await mutateAlerts();
    } catch (e) {
      toast({
        title: "Error deleting alert",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Failed to delete alert",
      });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, projectId, mutateAlerts, toast]);

  if (isLoadingSlack) {
    return (
      <SettingsSection>
        <SettingsSectionHeader title="Alerts" description="Configure Slack alerts for signal events." />
        <Skeleton className="h-32 w-full" />
      </SettingsSection>
    );
  }

  if (!slackIntegration) {
    return (
      <SettingsSection>
        <SettingsSectionHeader title="Alerts" description="Configure Slack alerts for signal events." />
        <SettingsSection>
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <h2 className="text-lg font-semibold">Connect Slack to get started</h2>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Connect your workspace to Slack to receive notifications.
            </p>
            <SlackConnectButton
              workspaceId={workspaceId}
              slackClientId={slackClientId}
              slackRedirectUri={slackRedirectUri}
              returnPath={`/project/${projectId}/settings?tab=alerts`}
            />
          </div>
        </SettingsSection>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection>
      <SettingsSectionHeader title="Alerts" description="Configure Slack alerts for signal events." />
      <SettingsSection>
        <div className="flex items-center justify-between">
          <CreateProjectAlertSheet
            projectId={projectId}
            workspaceId={workspaceId}
            integrationId={slackIntegration.id}
            onCreated={() => mutateAlerts()}
          />
        </div>

        <SettingsTable
          isLoading={isLoadingAlerts}
          isEmpty={!alertsList || alertsList.length === 0}
          emptyMessage="No alerts yet. Click 'Alert' to create one."
        >
          <SettingsTableRow>
            <th className="text-left text-xs font-medium text-muted-foreground p-2">Signal</th>
            <th className="text-left text-xs font-medium text-muted-foreground p-2">Channel</th>
            <th className="text-left text-xs font-medium text-muted-foreground p-2">Created</th>
            <th className="w-10 p-2" />
          </SettingsTableRow>
          {alertsList?.map((alert) => (
            <SettingsTableRow key={alert.id}>
              <td className="p-2 text-sm font-mono">{alert.name}</td>
              <td className="p-2 text-sm text-muted-foreground">
                {alert.targets.map((t) => (t.channelName ? `#${t.channelName}` : t.channelId)).join(", ") || "—"}
              </td>
              <td className="p-2 text-xs text-muted-foreground">{dateFormatter.format(new Date(alert.createdAt))}</td>
              <td className="p-2">
                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(alert)}>
                  <Trash2 size={14} className="text-muted-foreground" />
                </Button>
              </td>
            </SettingsTableRow>
          ))}
        </SettingsTable>
      </SettingsSection>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete alert"
        description={
          deleteTarget
            ? `Are you sure you want to delete the alert for "${deleteTarget.name}"? You will no longer receive notifications for this signal.`
            : ""
        }
        onConfirm={handleDelete}
        confirmText={isDeleting ? "Deleting..." : "Delete"}
      />
    </SettingsSection>
  );
}

interface CreateProjectAlertSheetProps {
  projectId: string;
  workspaceId: string;
  integrationId: string;
  onCreated: () => void;
}

function CreateProjectAlertSheet({ projectId, workspaceId, integrationId, onCreated }: CreateProjectAlertSheetProps) {
  const [open, setOpen] = useState(false);
  const [selectedSignalName, setSelectedSignalName] = useState<string>("");
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [dateRange, setDateRange] = useState<{ pastHours?: string; startDate?: string; endDate?: string }>({
    pastHours: "168",
  });
  const [chartContainerWidth, setChartContainerWidth] = useState<number | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const chartRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }

    (chartContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    if (!node) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(node);
    resizeObserverRef.current = resizeObserver;
  }, []);

  const handleDateRangeChange = useCallback((value: { pastHours?: string; startDate?: string; endDate?: string }) => {
    if (value.pastHours) {
      setDateRange({ pastHours: value.pastHours });
    } else if (value.startDate && value.endDate) {
      setDateRange({ startDate: value.startDate, endDate: value.endDate });
    }
  }, []);

  const { data: signalsData, isLoading: isLoadingSignals } = useSWR<{ items: SignalRow[] }>(
    open ? `/api/projects/${projectId}/signals?pageNumber=0&pageSize=100` : null,
    swrFetcher
  );

  const selectedSignal = useMemo(
    () => signalsData?.items?.find((s) => s.name === selectedSignalName),
    [signalsData, selectedSignalName]
  );

  const statsUrl = useTimeSeriesStatsUrl({
    baseUrl: selectedSignal ? `/api/projects/${projectId}/signals/${selectedSignal.id}/events/stats` : "",
    chartContainerWidth,
    pastHours: dateRange.pastHours ?? null,
    startDate: dateRange.startDate ?? null,
    endDate: dateRange.endDate ?? null,
  });

  const { data: eventsStats, isLoading: isLoadingStats } = useSWR<{ items: EventsStatsDataPoint[] }>(
    selectedSignal && statsUrl ? statsUrl : null,
    swrFetcher
  );

  const chartData = useMemo(() => eventsStats?.items ?? [], [eventsStats]);

  const chartConfig = useMemo(
    () => ({
      count: {
        label: selectedSignalName || "Events",
        color: "hsl(var(--primary))",
      },
    }),
    [selectedSignalName]
  );

  const { data: channels, isLoading: isLoadingChannels } = useSWR<SlackChannel[]>(
    open && selectedSignal ? `/api/workspaces/${workspaceId}/slack/channels` : null,
    swrFetcher
  );

  const selectedChannel = useMemo(
    () => channels?.find((ch) => ch.id === selectedChannelId),
    [channels, selectedChannelId]
  );

  const resetForm = useCallback(() => {
    setSelectedSignalName("");
    setSelectedChannelId("");
    setDateRange({ pastHours: "168" });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!selectedSignal || !selectedChannelId) return;

    setIsCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedSignal.name,
          type: "SIGNAL_EVENT",
          sourceId: selectedSignal.id,
          targets: [
            {
              type: "slack",
              integrationId,
              channelId: selectedChannelId,
              channelName: selectedChannel?.name ?? "",
            },
          ],
        }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({ error: "Failed to create alert" }))) as { error: string };
        throw new Error(error?.error ?? "Failed to create alert");
      }

      toast({ title: "Alert created successfully" });
      onCreated();
      setOpen(false);
      resetForm();
    } catch (e) {
      toast({
        title: "Error creating alert",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Failed to create alert",
      });
    } finally {
      setIsCreating(false);
    }
  }, [projectId, integrationId, selectedSignal, selectedChannelId, selectedChannel, onCreated, resetForm, toast]);

  const handleTest = useCallback(async () => {
    if (!selectedChannelId) return;

    setIsTesting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/slack/subscriptions/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: selectedChannelId }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({ error: "Failed to send test" }))) as { error: string };
        throw new Error(error?.error ?? "Failed to send test notification");
      }

      toast({ title: "Test notification sent" });
    } catch (e) {
      toast({
        title: "Error sending test",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Failed to send test notification",
      });
    } finally {
      setIsTesting(false);
    }
  }, [workspaceId, selectedChannelId, toast]);

  const canCreate = selectedSignalName && selectedChannelId && !isCreating;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" icon="plus" className="w-fit">
          Alert
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="min-w-[50vw] w-full flex flex-col gap-0">
        <SheetHeader className="py-4 px-4 border-b">
          <SheetTitle>New alert</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-6 p-4">
            <div className="grid gap-2">
              <Label>Signal</Label>
              <p className="text-xs text-muted-foreground">
                Choose the signal event that will trigger Slack notifications.
              </p>
              {isLoadingSignals ? (
                <Skeleton className="h-7 w-full" />
              ) : (
                <Select
                  value={selectedSignalName}
                  onValueChange={(value) => {
                    setSelectedSignalName(value);
                    setSelectedChannelId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a signal" />
                  </SelectTrigger>
                  <SelectContent>
                    {signalsData?.items?.map((s) => (
                      <SelectItem key={s.id} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedSignal && (
              <div className="flex flex-col gap-3 border rounded-md p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Event frequency &mdash; how often this alert would trigger
                  </span>
                  <DateRangeFilter
                    mode="state"
                    value={dateRange}
                    onChange={handleDateRangeChange}
                    className="h-7 text-xs"
                  />
                </div>
                <div ref={chartRefCallback}>
                  {!eventsStats && isLoadingStats ? (
                    <div className="overflow-hidden">
                      <ChartSkeleton />
                    </div>
                  ) : (
                    <TimeSeriesChart
                      data={chartData}
                      chartConfig={chartConfig}
                      fields={CHART_FIELDS}
                      containerWidth={chartContainerWidth}
                    />
                  )}
                </div>
              </div>
            )}

            {selectedSignal && (
              <div className="grid gap-2">
                <Label>Slack Channel</Label>
                <p className="text-xs text-muted-foreground">
                  Notifications will be sent to this channel. For private channels, invite the bot first.
                </p>
                {isLoadingChannels ? (
                  <Skeleton className="h-7 w-full" />
                ) : (
                  <div className="flex gap-2">
                    <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select a channel" />
                      </SelectTrigger>
                      <SelectContent>
                        {channels?.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>
                            #{ch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" disabled={!selectedChannelId || isTesting} onClick={handleTest}>
                      <Loader2 className={cn("hidden", { "animate-spin block": isTesting })} size={14} />
                      {!isTesting && <Send className="size-3.5 mr-1" />}
                      Test
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="flex justify-end px-4 py-3 border-t">
          <Button onClick={handleCreate} handleEnter disabled={!canCreate}>
            <Loader2 className={cn("mr-2 hidden", { "animate-spin block": isCreating })} size={16} />
            Create
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
