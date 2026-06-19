"use client";

import { HelpCircle, Loader2, Mail, Send, Slack } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import useSWR from "swr";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import { SeverityIcon } from "@/components/notifications/notification-panel/severity-icon";
import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import {
  ALERT_TARGET_TYPE,
  ALERT_TYPE,
  ALERT_TYPE_LABELS,
  type AlertWithDetails,
  SEVERITY_LABELS,
  type SeverityLevel,
} from "@/lib/actions/alerts/types";
import { type FilterDataType } from "@/lib/actions/common/filters";
import { type Signal, type SignalRow } from "@/lib/actions/signals";
import { type SlackChannel } from "@/lib/actions/slack";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

import AlertFiltersSection from "../alert-filters-section";
import SlackChannelPicker from "../slack-channel-picker";
import { syncAlertFilters } from "../sync-alert-filters";
import { AlertSection } from "./alert-section";
import { ALERT_TYPE_DESCRIPTIONS, type AlertFormValues, CHART_FIELDS, SEVERITY_OPTIONS } from "./types";

interface AlertFormProps {
  projectId: string;
  workspaceId: string;
  integrationId?: string | null;
  alert?: AlertWithDetails | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  userEmail: string;
  fixedSignalId?: string;
  signals: SignalRow[];
  boundSignal?: Signal;
  previousFilterIds: string[];
  defaultValues: AlertFormValues;
}

export function AlertForm({
  projectId,
  workspaceId,
  integrationId,
  alert,
  onOpenChange,
  onSaved,
  userEmail,
  fixedSignalId,
  signals,
  boundSignal,
  previousFilterIds,
  defaultValues,
}: AlertFormProps) {
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

  const form = useForm<AlertFormValues>({ defaultValues });
  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = form;

  const alertType = watch("type");
  const signalName = watch("signalName");
  const slackChannels = watch("slackChannels");
  const severities = watch("severities");
  // useWatch so deep edits inside the alertFilters field array drive the preview.
  const alertFilters = useWatch({ control, name: "alertFilters" });

  const selectedSignal = useMemo(
    () => signals.find((s) => s.name === signalName) ?? boundSignal,
    [signals, signalName, boundSignal]
  );

  // Keep the bound signal selectable even when it's outside the paginated list.
  const signalOptions = useMemo<Array<Pick<SignalRow, "id" | "name" | "prompt">>>(() => {
    if (boundSignal && !signals.some((s) => s.id === boundSignal.id)) {
      return [boundSignal, ...signals];
    }
    return signals;
  }, [signals, boundSignal]);

  const { data: selectedSignalDetails } = useSWR<{ structuredOutput?: unknown }>(
    selectedSignal ? `/api/projects/${projectId}/signals/${selectedSignal.id}` : null,
    swrFetcher
  );

  const additionalParams = useMemo(
    () =>
      alertType === ALERT_TYPE.SIGNAL_EVENT && severities && severities.length > 0
        ? { severities: severities.map(String) }
        : undefined,
    [alertType, severities]
  );

  // Map signal output fields to ClickHouse-comparable types for the event-stats filter.
  const filterFieldTypes = useMemo(() => {
    const fields = jsonSchemaToSchemaFields(selectedSignalDetails?.structuredOutput);
    const map = new Map<string, FilterDataType>();
    for (const field of fields) {
      map.set(field.name, field.type === "number" ? "number" : field.type === "boolean" ? "boolean" : "string");
    }
    return map;
  }, [selectedSignalDetails?.structuredOutput]);

  const filterGroups = useMemo(() => (alertFilters ?? []).filter((t) => t.filters.length > 0), [alertFilters]);

  // The preview ANDs all conditions, so it can only represent a single group;
  // 2+ groups (OR) drop field conditions and show a note instead of a wrong count.
  const hasMultipleFilterGroups = alertType === ALERT_TYPE.SIGNAL_EVENT && filterGroups.length > 1;

  const previewFilterStrings = useMemo(() => {
    if (alertType !== ALERT_TYPE.SIGNAL_EVENT || filterGroups.length !== 1) return [];
    return filterGroups[0].filters
      .filter((f) => String(f.value ?? "").trim() !== "")
      .map((f) => JSON.stringify({ ...f, dataType: filterFieldTypes.get(f.column) ?? "string" }));
  }, [alertType, filterGroups, filterFieldTypes]);

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
    filters: previewFilterStrings,
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
  }>(hasSlackIntegration ? `/api/workspaces/${workspaceId}/slack/channels` : null, swrFetcher);
  const channels = channelsResult?.channels;

  useEffect(() => {
    if (channelsResult?.rateLimited) {
      toast({
        title: "Slack channel list may be incomplete",
        description: "Slack rate-limited the request. Some channels may not appear in the picker.",
      });
    }
  }, [channelsResult, toast]);

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
        // Preserve Slack targets the user can't see/edit when Slack is disconnected.
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
                // Force skipSimilar off without clustering so a stale form value can't leak through.
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

        // Sync filters in a nested try so a sync failure can't re-POST a duplicate alert.
        let filterSyncError: string | null = null;
        if (data.type === ALERT_TYPE.SIGNAL_EVENT) {
          const alertId = isEditMode ? alert!.id : ((await res.clone().json()) as { id: string }).id;
          const filtersToSync = data.alertFilters.filter((t) => t.filters.length > 0);
          if (filtersToSync.length > 0 || previousFilterIds.length > 0) {
            try {
              await syncAlertFilters(projectId, alertId, filtersToSync, isEditMode ? previousFilterIds : []);
            } catch (e) {
              filterSyncError = e instanceof Error ? e.message : "Failed to sync alert filters.";
            }
          }
        }

        toast(
          filterSyncError
            ? {
                variant: "destructive",
                title: isEditMode
                  ? "Alert updated, but filters failed to sync"
                  : "Alert created, but filters failed to sync",
                description: `${filterSyncError} Reopen the alert to retry configuring filters.`,
              }
            : {
                title: isEditMode ? "Alert updated" : "Alert created",
                description: isEditMode
                  ? `"${data.name.trim()}" has been updated.`
                  : `"${data.name.trim()}" is now active and will send notifications.`,
              }
        );
        track("alerts", isEditMode ? "updated" : "created", {
          has_slack: data.slackChannels.length > 0,
          slack_channel_count: data.slackChannels.length,
          has_email: data.emailEnabled,
        });
        onSaved();
        onOpenChange(false);
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
      toast,
      isEditMode,
      alert,
      onOpenChange,
      clusteringEnabled,
      previousFilterIds,
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

  return (
    <FormProvider {...form}>
      <form className="flex flex-col flex-1 overflow-hidden" onSubmit={handleSubmit(onSubmit)}>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-8 p-4 pb-24">
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
                    className={cn(fieldState.error && "border-destructive focus-visible:ring-destructive")}
                  />
                  {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                </div>
              )}
            />

            {!fixedSignalId && (
              <Controller
                name="signalName"
                control={control}
                rules={{ required: "Signal is required" }}
                render={({ field, fieldState }) => (
                  <div className="grid gap-2">
                    <Label>Signal</Label>
                    <Select value={field.value} onValueChange={(value) => field.onChange(value)}>
                      <SelectTrigger className={cn(fieldState.error && "border-destructive")}>
                        <SelectValue placeholder="Select a signal" />
                      </SelectTrigger>
                      <SelectContent className="max-w-[var(--radix-select-trigger-width)]">
                        {signalOptions.map((s) => (
                          <SelectItem key={s.id} value={s.name} description={s.prompt}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                  </div>
                )}
              />
            )}

            {selectedSignal && clusteringEnabled && (
              <AlertSection title="Trigger" description="Choose the activity that fires this alert.">
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-2">
                      {([ALERT_TYPE.SIGNAL_EVENT, ALERT_TYPE.NEW_CLUSTER] as const).map((t) => {
                        const isSelected = field.value === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            disabled={isEditMode}
                            onClick={() => field.onChange(t)}
                            className={cn(
                              "flex flex-col gap-1 rounded-md border p-3 text-left transition-colors",
                              isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                              isEditMode && "cursor-not-allowed opacity-60"
                            )}
                          >
                            <span className="text-sm font-medium">{ALERT_TYPE_LABELS[t]}</span>
                            <span className="text-xs text-muted-foreground">{ALERT_TYPE_DESCRIPTIONS[t]}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              </AlertSection>
            )}

            {selectedSignal && (
              <>
                {alertType === ALERT_TYPE.SIGNAL_EVENT && (
                  <AlertSection title="Conditions" description="Only notify for events that match all of these.">
                    <Controller
                      name="severities"
                      control={control}
                      shouldUnregister
                      rules={{
                        validate: (value) => (value && value.length > 0) || "Select at least one severity level",
                      }}
                      render={({ field, fieldState }) => {
                        const selected = new Set(field.value);
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
                            <TooltipProvider delayDuration={200}>
                              <div className="flex items-center gap-1.5">
                                <Label>Severity</Label>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-72">
                                    <p>
                                      Laminar assigns a severity (info, warning, or critical) to every event when the
                                      signal detects it. This alert only fires for the severities you select here.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </TooltipProvider>
                            <div className="flex flex-row flex-wrap items-center gap-2">
                              {SEVERITY_OPTIONS.map((level) => {
                                const isChecked = selected.has(level);
                                return (
                                  <div key={level} className="rounded-md border px-3 py-2">
                                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-normal">
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={(checked) => toggle(level, !!checked)}
                                        className="[&_svg]:!text-primary-foreground [&_svg]:!size-[10px]"
                                      />
                                      <SeverityIcon severity={level} />
                                      <span>{SEVERITY_LABELS[level]}</span>
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                            {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                          </div>
                        );
                      }}
                    />

                    <AlertFiltersSection schema={selectedSignalDetails?.structuredOutput} />

                    {clusteringEnabled && (
                      <Controller
                        name="skipSimilar"
                        control={control}
                        render={({ field }) => (
                          <div className="flex items-center justify-between rounded-md border p-3">
                            <div className="pr-3">
                              <p className="text-sm font-medium">Skip notifications for similar events</p>
                              <p className="text-xs text-muted-foreground">
                                When enabled, only the first event in a group of semantically similar events will
                                trigger a notification. Subsequent events in the same group are ignored.
                              </p>
                            </div>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </div>
                        )}
                      />
                    )}
                  </AlertSection>
                )}

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
                  {hasMultipleFilterGroups && (
                    <p className="text-xs text-muted-foreground">
                      Preview reflects severity only — multiple filter groups aren&apos;t applied here.
                    </p>
                  )}
                </div>

                <AlertSection title="Delivery" description="Choose where to send notifications.">
                  <div className="flex flex-col divide-y rounded-md border">
                    <Controller
                      name="emailEnabled"
                      control={control}
                      render={({ field }) => (
                        <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-3">
                            <Mail className="size-4 text-muted-foreground" />
                            <div className="flex items-baseline gap-2">
                              <p className="text-sm font-medium">Email</p>
                              <p className="text-xs text-muted-foreground">{userEmail}</p>
                            </div>
                          </div>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </div>
                      )}
                    />
                    {hasSlackIntegration && (
                      <Controller
                        name="slackChannels"
                        control={control}
                        render={({ field, fieldState }) => (
                          <div className="grid gap-2 p-3">
                            <div className="flex items-center gap-3">
                              <Slack className="size-4 shrink-0 text-muted-foreground" />
                              <Label className="text-sm font-medium">Slack channels</Label>
                            </div>
                            <div className="flex items-center gap-2 pl-7">
                              <SlackChannelPicker
                                className="flex-1"
                                channels={channels}
                                isLoading={isLoadingChannels}
                                value={field.value}
                                onChange={field.onChange}
                                placeholder="Search for channels..."
                                invalid={!!fieldState.error}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                className="shrink-0"
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
                  </div>
                </AlertSection>
              </>
            )}
          </div>
        </ScrollArea>
        <div className="flex justify-end px-4 py-3 border-t">
          <Button type="submit" disabled={isSubmitting || !selectedSignal || !alertType}>
            <Loader2 className={cn("mr-2 hidden", { "animate-spin block": isSubmitting })} size={16} />
            {isEditMode ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
