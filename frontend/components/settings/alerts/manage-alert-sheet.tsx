"use client";

import { CaretSortIcon } from "@radix-ui/react-icons";
import { Loader2, Mail, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import useSWR from "swr";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import DateRangeFilter from "@/components/ui/date-range-filter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import {
  ALERT_TARGET_TYPE,
  ALERT_TYPE,
  ALERT_TYPE_LABELS,
  type AlertType,
  type AlertWithDetails,
  SEVERITY_LABELS,
  SEVERITY_LEVEL,
  type SeverityLevel,
  type SignalEventAlertMetadata,
} from "@/lib/actions/alerts/types";
import { type SignalRow } from "@/lib/actions/signals";
import { type SlackChannel } from "@/lib/actions/slack";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

import SlackChannelPicker, { type SlackChannelSelection } from "./slack-channel-picker";

interface ManageAlertSheetProps {
  projectId: string;
  workspaceId: string;
  integrationId?: string | null;
  alert?: AlertWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  userEmail: string;
}

interface AlertFormValues {
  type: AlertType | "";
  name: string;
  signalName: string;
  slackChannels: SlackChannelSelection[];
  emailEnabled: boolean;
  severities: SeverityLevel[];
  skipSimilar: boolean;
}

const CHART_FIELDS = ["count"] as const;

const SEVERITY_OPTIONS = [SEVERITY_LEVEL.INFO, SEVERITY_LEVEL.WARNING, SEVERITY_LEVEL.CRITICAL] as const;

const DEFAULT_VALUES: AlertFormValues = {
  type: "",
  name: "",
  signalName: "",
  slackChannels: [],
  emailEnabled: false,
  severities: [SEVERITY_LEVEL.CRITICAL],
  skipSimilar: true,
};

const ALERT_TYPE_DESCRIPTIONS: Record<AlertType, string> = {
  [ALERT_TYPE.SIGNAL_EVENT]: "Notify when a new signal event is detected.",
  [ALERT_TYPE.NEW_CLUSTER]: "Notify when a new cluster is created.",
};

export default function ManageAlertSheet({
  projectId,
  workspaceId,
  integrationId,
  alert,
  open,
  onOpenChange,
  onSaved,
  userEmail,
}: ManageAlertSheetProps) {
  const isEditMode = !!alert;
  const hasSlackIntegration = !!integrationId;
  const featureFlags = useFeatureFlags();
  const clusteringEnabled = featureFlags[Feature.CLUSTERING];

  const [isTesting, setIsTesting] = useState(false);
  const [dateRange, setDateRange] = useState<{ pastHours?: string; startDate?: string; endDate?: string }>({
    pastHours: "168",
  });
  const [chartContainerWidth, setChartContainerWidth] = useState<number | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm<AlertFormValues>({ defaultValues: DEFAULT_VALUES });

  const alertType = watch("type");
  const signalName = watch("signalName");
  const slackChannels = watch("slackChannels");
  const severities = watch("severities");

  const resetFormFromSignals = useCallback(
    (data: { items: SignalRow[] }) => {
      if (!alert) {
        reset(DEFAULT_VALUES);
        return;
      }

      const signal = data.items?.find((s) => s.id === alert.sourceId);
      const slackTargets = alert.targets.filter((t) => t.type === ALERT_TARGET_TYPE.SLACK);
      const emailTarget = alert.targets.find((t) => t.type === ALERT_TARGET_TYPE.EMAIL && t.email === userEmail);
      const signalEventMeta =
        alert.type === ALERT_TYPE.SIGNAL_EVENT ? (alert.metadata as SignalEventAlertMetadata) : null;

      const restoredSlackChannels: SlackChannelSelection[] = slackTargets
        .filter((t) => t.channelId && t.channelName)
        .map((t) => ({ id: t.channelId!, name: t.channelName! }));

      reset({
        type: alert.type,
        name: alert.name,
        signalName: signal?.name ?? "",
        slackChannels: restoredSlackChannels,
        emailEnabled: !!emailTarget,
        severities:
          signalEventMeta?.severities && signalEventMeta.severities.length > 0
            ? signalEventMeta.severities
            : [SEVERITY_LEVEL.CRITICAL],
        skipSimilar: signalEventMeta?.skipSimilar ?? false,
      });
    },
    [alert, reset, userEmail]
  );

  const {
    data: signalsData,
    isLoading: isLoadingSignals,
    isValidating: isValidatingSignals,
  } = useSWR<{ items: SignalRow[] }>(
    open ? `/api/projects/${projectId}/signals?pageNumber=0&pageSize=100` : null,
    swrFetcher,
    {
      onSuccess: resetFormFromSignals,
    }
  );

  const isSignalsReady = !!signalsData && !isLoadingSignals && !isValidatingSignals;

  useEffect(() => {
    if (!open || !isSignalsReady) return;
    resetFormFromSignals(signalsData);
  }, [open, isSignalsReady, signalsData, resetFormFromSignals]);

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

  const handleChartZoom = useCallback((startDate: string, endDate: string) => {
    setDateRange({ startDate, endDate });
  }, []);

  const selectedSignal = useMemo(
    () => signalsData?.items?.find((s) => s.name === signalName),
    [signalsData, signalName]
  );

  const additionalParams = useMemo(
    () =>
      alertType === ALERT_TYPE.SIGNAL_EVENT && severities && severities.length > 0
        ? { severities: severities.map(String) }
        : undefined,
    [alertType, severities]
  );

  const statsBaseUrl = useMemo(() => {
    if (!selectedSignal || !alertType) return "";
    return alertType === ALERT_TYPE.SIGNAL_EVENT
      ? `/api/projects/${projectId}/signals/${selectedSignal.id}/events/stats`
      : `/api/projects/${projectId}/signals/${selectedSignal.id}/clusters/stats`;
  }, [alertType, projectId, selectedSignal]);

  const statsUrl = useTimeSeriesStatsUrl({
    baseUrl: statsBaseUrl,
    chartContainerWidth,
    pastHours: dateRange.pastHours ?? null,
    startDate: dateRange.startDate ?? null,
    endDate: dateRange.endDate ?? null,
    additionalParams,
  });

  const { data: eventsStats, isLoading: isLoadingStats } = useSWR<{ items: TimeSeriesDataPoint[] }>(
    selectedSignal && statsUrl ? statsUrl : null,
    swrFetcher,
    {
      keepPreviousData: true,
    }
  );

  const totalEventCount = useMemo(
    () => (eventsStats?.items ?? []).reduce((sum, d) => sum + d.count, 0),
    [eventsStats?.items]
  );

  const dateRangeLabel = useMemo(() => {
    if (dateRange.pastHours) {
      const hours = parseInt(dateRange.pastHours, 10);
      if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
      const days = Math.round(hours / 24);
      if (days === 7) return "week";
      if (days === 30) return "30 days";
      return `${days} day${days === 1 ? "" : "s"}`;
    }
    return "selected period";
  }, [dateRange]);

  const chartConfig = useMemo(
    () => ({
      count: {
        label: alertType === ALERT_TYPE.NEW_CLUSTER ? "New clusters" : signalName || "Events",
        color: "hsl(var(--primary))",
      },
    }),
    [alertType, signalName]
  );

  const chartHeading = useMemo(() => {
    if (alertType === ALERT_TYPE.NEW_CLUSTER) {
      return `New clusters created in the past ${dateRangeLabel}: ${totalEventCount}`;
    }
    return `${totalEventCount} event${totalEventCount === 1 ? "" : "s"} for the past ${dateRangeLabel}`;
  }, [alertType, dateRangeLabel, totalEventCount]);

  const { data: channelsResult, isLoading: isLoadingChannels } = useSWR<{
    channels: SlackChannel[];
    rateLimited: boolean;
  }>(open && hasSlackIntegration ? `/api/workspaces/${workspaceId}/slack/channels` : null, swrFetcher);
  const channels = channelsResult?.channels;

  useEffect(() => {
    if (channelsResult?.rateLimited) {
      toast({
        title: "Slack channel list may be incomplete",
        description: "Slack rate-limited the request. Some channels may not appear in the picker.",
      });
    }
  }, [channelsResult, toast]);

  const resetForm = useCallback(() => {
    reset(DEFAULT_VALUES);
    setDateRange({ pastHours: "168" });
  }, [reset]);

  const onSubmit = useCallback(
    async (data: AlertFormValues) => {
      if (!data.type || !selectedSignal) return;

      const targets: Array<{
        type: string;
        integrationId?: string;
        channelId?: string;
        channelName?: string;
        email?: string;
      }> = [];

      if (hasSlackIntegration && integrationId && data.slackChannels.length > 0) {
        for (const selection of data.slackChannels) {
          targets.push({
            type: ALERT_TARGET_TYPE.SLACK,
            integrationId,
            channelId: selection.id,
            channelName: selection.name,
          });
        }
      } else if (!hasSlackIntegration && isEditMode && alert) {
        // Preserve existing Slack targets the user can't see/edit when Slack is disconnected
        for (const t of alert.targets) {
          if (t.type === ALERT_TARGET_TYPE.SLACK) {
            targets.push({
              type: ALERT_TARGET_TYPE.SLACK,
              integrationId: t.integrationId ?? undefined,
              channelId: t.channelId ?? undefined,
              channelName: t.channelName ?? undefined,
            });
          }
        }
      }

      // Legacy Slack targets missing channelId or channelName aren't shown in the
      // picker (resetFormFromSignals filters them out), so they'd be silently
      // dropped by the full-targets replace on save. Carry them through untouched.
      // (The !hasSlackIntegration branch above already preserves all Slack targets,
      // so only run this when Slack is connected.)
      if (hasSlackIntegration && isEditMode && alert) {
        for (const t of alert.targets) {
          if (t.type !== ALERT_TARGET_TYPE.SLACK) continue;
          if (t.channelId && t.channelName) continue;
          targets.push({
            type: ALERT_TARGET_TYPE.SLACK,
            integrationId: t.integrationId ?? undefined,
            channelId: t.channelId ?? undefined,
            channelName: t.channelName ?? undefined,
          });
        }
      }

      if (data.emailEnabled && userEmail) {
        targets.push({
          type: ALERT_TARGET_TYPE.EMAIL,
          email: userEmail,
        });
      }

      try {
        const url = isEditMode ? `/api/projects/${projectId}/alerts/${alert.id}` : `/api/projects/${projectId}/alerts`;
        const method = isEditMode ? "PATCH" : "POST";

        const metadata =
          data.type === ALERT_TYPE.SIGNAL_EVENT
            ? {
                severities: Array.from(new Set(data.severities)).sort((a, b) => a - b),
                // skipSimilar relies on the clustering service; force it off when
                // clustering is disabled so the backend doesn't receive a stale
                // value from a hidden toggle or the default form state.
                skipSimilar: clusteringEnabled ? data.skipSimilar : false,
              }
            : {};

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name.trim(),
            type: data.type,
            sourceId: selectedSignal.id,
            targets,
            metadata,
          }),
        });

        if (!res.ok) {
          const error = (await res
            .json()
            .catch(() => ({ error: `Failed to ${isEditMode ? "update" : "create"} alert` }))) as { error: string };
          throw new Error(error?.error ?? `Failed to ${isEditMode ? "update" : "create"} alert`);
        }

        toast({
          title: isEditMode ? "Alert updated" : "Alert created",
          description: isEditMode
            ? `"${data.name.trim()}" has been updated.`
            : `"${data.name.trim()}" is now active and will send notifications.`,
        });
        track("alerts", isEditMode ? "updated" : "created", {
          has_slack: data.slackChannels.length > 0,
          slack_channel_count: data.slackChannels.length,
          has_email: data.emailEnabled,
        });
        onSaved();
        onOpenChange(false);
        if (!isEditMode) resetForm();
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            e instanceof Error ? e.message : `Failed to ${isEditMode ? "update" : "create"} alert. Please try again.`,
        });
      }
    },
    [
      projectId,
      integrationId,
      hasSlackIntegration,
      selectedSignal,
      userEmail,
      onSaved,
      resetForm,
      toast,
      isEditMode,
      alert,
      onOpenChange,
      clusteringEnabled,
    ]
  );

  const handleTest = useCallback(async () => {
    if (slackChannels.length === 0 || !signalName) return;

    setIsTesting(true);
    try {
      const results = await Promise.allSettled(
        slackChannels.map((selection) =>
          fetch(`/api/workspaces/${workspaceId}/slack/channels/${selection.id}/test`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventName: signalName }),
          }).then(async (res) => {
            if (!res.ok) {
              const err = (await res.json().catch(() => ({ error: "Failed to send test" }))) as { error: string };
              throw new Error(err?.error ?? "Failed to send test notification");
            }
          })
        )
      );

      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

      if (failures.length === 0) {
        toast({
          title: "Test sent",
          description:
            slackChannels.length === 1
              ? "A test notification was sent to the selected channel."
              : `Test notifications were sent to ${slackChannels.length} channels.`,
        });
      } else if (failures.length === slackChannels.length) {
        throw new Error(
          failures[0].reason instanceof Error ? failures[0].reason.message : "Failed to send test notifications"
        );
      } else {
        toast({
          variant: "destructive",
          title: "Some tests failed",
          description: `${failures.length} of ${slackChannels.length} test notifications failed to send.`,
        });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to send test notification. Please try again.",
      });
    } finally {
      setIsTesting(false);
    }
  }, [workspaceId, slackChannels, signalName, toast]);

  const isSignalsSectionLoading = isLoadingSignals || isValidatingSignals;

  const sheetContent = (
    <SheetContent side="right" className="sm:max-w-none! w-[45vw] flex flex-col gap-0 focus:outline-none">
      <SheetHeader className="py-4 px-4 border-b">
        <SheetTitle>{isEditMode ? "Edit alert" : "New alert"}</SheetTitle>
      </SheetHeader>
      <form className="flex flex-col flex-1 overflow-hidden" onSubmit={handleSubmit(onSubmit)}>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-6 p-4">
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <div className="grid gap-2">
                  <Label>Trigger</Label>
                  {field.value && (
                    <p className="text-xs text-muted-foreground">{ALERT_TYPE_DESCRIPTIONS[field.value]}</p>
                  )}
                  <Select
                    value={field.value || undefined}
                    onValueChange={(value) => field.onChange(value as AlertType)}
                    disabled={isEditMode}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a notification trigger" />
                    </SelectTrigger>
                    <SelectContent>
                      {([ALERT_TYPE.SIGNAL_EVENT, ...(clusteringEnabled ? [ALERT_TYPE.NEW_CLUSTER] : [])] as const).map(
                        (t) => (
                          <SelectItem key={t} value={t}>
                            {ALERT_TYPE_LABELS[t]}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />

            {alertType && (
              <>
                <Controller
                  name="name"
                  control={control}
                  rules={{ required: "Alert name is required" }}
                  render={({ field, fieldState }) => (
                    <div className="grid gap-2">
                      <Label>Name</Label>
                      <Input
                        {...field}
                        placeholder="e.g. High error rate alert"
                        disabled={isSignalsSectionLoading}
                        className={cn(fieldState.error && "border-destructive focus-visible:ring-destructive")}
                      />
                      {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                    </div>
                  )}
                />

                <Controller
                  name="signalName"
                  control={control}
                  rules={{ required: "Signal is required" }}
                  render={({ field, fieldState }) => (
                    <div className="grid gap-2">
                      <Label>Signal</Label>
                      <p className="text-xs text-muted-foreground">Choose the signal that will trigger alert.</p>
                      {isSignalsSectionLoading ? (
                        <Skeleton className="h-7 w-full" />
                      ) : (
                        <>
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                            }}
                          >
                            <SelectTrigger className={cn(fieldState.error && "border-destructive")}>
                              <SelectValue placeholder="Select a signal" />
                            </SelectTrigger>
                            <SelectContent className="max-w-[var(--radix-select-trigger-width)]">
                              {signalsData?.items?.map((s) => (
                                <SelectItem key={s.id} value={s.name} description={s.prompt}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                        </>
                      )}
                    </div>
                  )}
                />

                {selectedSignal && alertType === ALERT_TYPE.SIGNAL_EVENT && (
                  <Controller
                    name="severities"
                    control={control}
                    shouldUnregister
                    rules={{
                      validate: (value) => (value && value.length > 0) || "Select at least one severity level",
                    }}
                    render={({ field, fieldState }) => {
                      const selected = new Set(field.value);
                      const sortedSelected = SEVERITY_OPTIONS.filter((l) => selected.has(l));
                      const triggerLabel =
                        sortedSelected.length === 0
                          ? "Select severities"
                          : sortedSelected.map((l) => SEVERITY_LABELS[l]).join(", ");
                      const toggle = (level: SeverityLevel, checked: boolean) => {
                        const next = new Set(field.value);
                        if (checked) {
                          next.add(level);
                        } else {
                          next.delete(level);
                        }
                        field.onChange(SEVERITY_OPTIONS.filter((l) => next.has(l)) as SeverityLevel[]);
                      };
                      return (
                        <div className="grid gap-2">
                          <Label>Severity</Label>
                          <p className="text-xs text-muted-foreground">
                            Trigger notifications for events with any of the selected severity levels.
                          </p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "h-7 w-full justify-between px-2 text-xs font-normal",
                                  fieldState.error && "border-destructive"
                                )}
                              >
                                <span className="truncate">{triggerLabel}</span>
                                <CaretSortIcon className="h-4 w-4 opacity-50" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                              <DropdownMenuGroup>
                                {SEVERITY_OPTIONS.map((level) => {
                                  const isChecked = selected.has(level);
                                  return (
                                    <DropdownMenuItem
                                      key={level}
                                      onSelect={(e) => e.preventDefault()}
                                      onClick={() => toggle(level, !isChecked)}
                                      className="gap-2"
                                    >
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={(checked) => toggle(level, !!checked)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="[&_svg]:!text-primary-foreground [&_svg]:!size-[10px]"
                                      />
                                      <span>{SEVERITY_LABELS[level]}</span>
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                        </div>
                      );
                    }}
                  />
                )}

                {selectedSignal && alertType === ALERT_TYPE.SIGNAL_EVENT && clusteringEnabled && (
                  <Controller
                    name="skipSimilar"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center justify-between rounded-md border p-3">
                        <div className="pr-3">
                          <p className="text-sm font-medium">Skip notifications for similar events</p>
                          <p className="text-xs text-muted-foreground">
                            When enabled, only the first event in a group of semantically similar events will trigger a
                            notification. Subsequent events in the same group are ignored.
                          </p>
                        </div>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                    )}
                  />
                )}

                {selectedSignal && (
                  <div className="flex flex-col gap-3 border rounded-md p-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">{chartHeading}</span>
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
                          data={eventsStats?.items ?? []}
                          chartConfig={chartConfig}
                          fields={CHART_FIELDS}
                          containerWidth={chartContainerWidth}
                          onZoom={handleChartZoom}
                        />
                      )}
                    </div>
                  </div>
                )}

                {selectedSignal && (
                  <div className="grid gap-4">
                    <Label>Notification targets</Label>
                    <p className="text-xs text-muted-foreground -mt-3">Choose where to send alert notifications.</p>

                    {hasSlackIntegration && (
                      <Controller
                        name="slackChannels"
                        control={control}
                        render={({ field, fieldState }) => (
                          <div className="grid gap-2">
                            <Label className="text-xs font-normal text-muted-foreground">Slack channels</Label>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <SlackChannelPicker
                                  channels={channels}
                                  isLoading={isLoadingChannels}
                                  value={field.value}
                                  onChange={field.onChange}
                                  placeholder="Search for channels..."
                                  invalid={!!fieldState.error}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={field.value.length === 0 || isTesting}
                                onClick={handleTest}
                              >
                                <Loader2 className={cn("hidden", { "animate-spin block mr-1": isTesting })} size={14} />
                                {!isTesting && <Send className="size-3.5 mr-1" />}
                                Test
                              </Button>
                            </div>
                            {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                          </div>
                        )}
                      />
                    )}

                    <Controller
                      name="emailEnabled"
                      control={control}
                      render={({ field }) => (
                        <div className="flex items-center justify-between rounded-md border p-3">
                          <div className="flex items-center gap-2">
                            <Mail className="size-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">Email</p>
                              <p className="text-xs text-muted-foreground">{userEmail}</p>
                            </div>
                          </div>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </div>
                      )}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
        <div className="flex justify-end px-4 py-3 border-t">
          <Button type="submit" disabled={isSubmitting || !alertType}>
            <Loader2 className={cn("mr-2 hidden", { "animate-spin block": isSubmitting })} size={16} />
            {isEditMode ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </SheetContent>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) resetForm();
      }}
    >
      {sheetContent}
    </Sheet>
  );
}
