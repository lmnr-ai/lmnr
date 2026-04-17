"use client";

import { Loader2, Mail, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import useSWR from "swr";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { type TimeSeriesDataPoint } from "@/components/charts/time-series-chart/types";
import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ALERT_TARGET_TYPE,
  type AlertWithDetails,
  SEVERITY_LABELS,
  SEVERITY_LEVEL,
  type SeverityLevel,
} from "@/lib/actions/alerts/types";
import { type SignalRow } from "@/lib/actions/signals";
import { type SlackChannel } from "@/lib/actions/slack";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, swrFetcher } from "@/lib/utils";

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
  name: string;
  signalName: string;
  channelId: string;
  emailEnabled: boolean;
  severity: SeverityLevel;
  skipSimilar: boolean;
}

const CHART_FIELDS = ["count"] as const;

const DEFAULT_VALUES: AlertFormValues = {
  name: "",
  signalName: "",
  channelId: "",
  emailEnabled: false,
  severity: SEVERITY_LEVEL.CRITICAL,
  skipSimilar: true,
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
    setValue,
    formState: { isSubmitting },
  } = useForm<AlertFormValues>({ defaultValues: DEFAULT_VALUES });

  const signalName = watch("signalName");
  const channelId = watch("channelId");
  const emailEnabled = watch("emailEnabled");
  const severity = watch("severity");

  const resetFormFromSignals = useCallback(
    (data: { items: SignalRow[] }) => {
      if (!alert) {
        reset(DEFAULT_VALUES);
        return;
      }

      const signal = data.items?.find((s) => s.id === alert.sourceId);
      const slackTarget = alert.targets.find((t) => t.type === ALERT_TARGET_TYPE.SLACK);
      const emailTarget = alert.targets.find((t) => t.type === ALERT_TARGET_TYPE.EMAIL && t.email === userEmail);

      reset({
        name: alert.name,
        signalName: signal?.name ?? "",
        channelId: slackTarget?.channelId ?? "",
        emailEnabled: !!emailTarget,
        severity: alert.metadata.severity ?? SEVERITY_LEVEL.CRITICAL,
        skipSimilar: alert.metadata.skipSimilar ?? true,
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

  const additionalParams = useMemo(() => ({ severity: String(severity) }), [severity]);

  const statsUrl = useTimeSeriesStatsUrl({
    baseUrl: selectedSignal ? `/api/projects/${projectId}/signals/${selectedSignal.id}/events/stats` : "",
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
        label: signalName || "Events",
        color: "hsl(var(--primary))",
      },
    }),
    [signalName]
  );

  const { data: channels, isLoading: isLoadingChannels } = useSWR<SlackChannel[]>(
    open && hasSlackIntegration ? `/api/workspaces/${workspaceId}/slack/channels` : null,
    swrFetcher
  );

  const selectedChannel = useMemo(() => channels?.find((ch) => ch.id === channelId), [channels, channelId]);

  const channelItems = useMemo(
    () => (channels ?? []).map((ch) => ({ value: ch.id, label: `#${ch.name}` })),
    [channels]
  );

  const resetForm = useCallback(() => {
    reset(DEFAULT_VALUES);
    setDateRange({ pastHours: "168" });
  }, [reset]);

  const onSubmit = useCallback(
    async (data: AlertFormValues) => {
      if (!selectedSignal) return;

      const targets: Array<{
        type: string;
        integrationId?: string;
        channelId?: string;
        channelName?: string;
        email?: string;
      }> = [];

      if (data.channelId && hasSlackIntegration && integrationId) {
        targets.push({
          type: ALERT_TARGET_TYPE.SLACK,
          integrationId,
          channelId: data.channelId,
          channelName: selectedChannel?.name ?? "",
        });
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

      if (data.emailEnabled && userEmail) {
        targets.push({
          type: ALERT_TARGET_TYPE.EMAIL,
          email: userEmail,
        });
      }

      if (!isEditMode && targets.length === 0) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "At least one notification target (Slack channel or email) is required.",
        });
        return;
      }

      try {
        const url = isEditMode ? `/api/projects/${projectId}/alerts/${alert.id}` : `/api/projects/${projectId}/alerts`;
        const method = isEditMode ? "PATCH" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name.trim(),
            type: "SIGNAL_EVENT",
            sourceId: selectedSignal.id,
            targets,
            metadata: { severity: data.severity, skipSimilar: data.skipSimilar },
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
      selectedChannel,
      userEmail,
      onSaved,
      resetForm,
      toast,
      isEditMode,
      alert,
      onOpenChange,
    ]
  );

  const handleTest = useCallback(async () => {
    if (!channelId || !signalName) return;

    setIsTesting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/slack/channels/${channelId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventName: signalName }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({ error: "Failed to send test" }))) as { error: string };
        throw new Error(error?.error ?? "Failed to send test notification");
      }

      toast({ title: "Test sent", description: "A test notification was sent to the selected channel." });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to send test notification. Please try again.",
      });
    } finally {
      setIsTesting(false);
    }
  }, [workspaceId, channelId, signalName, toast]);

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
                          setValue("channelId", "");
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

            {selectedSignal && (
              <Controller
                name="severity"
                control={control}
                render={({ field }) => (
                  <div className="grid gap-2">
                    <Label>Severity</Label>
                    <p className="text-xs text-muted-foreground">
                      Only trigger notifications for events with this severity level.
                    </p>
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v) as SeverityLevel)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {([SEVERITY_LEVEL.INFO, SEVERITY_LEVEL.WARNING, SEVERITY_LEVEL.CRITICAL] as const).map(
                          (level) => (
                            <SelectItem key={level} value={String(level)}>
                              {SEVERITY_LABELS[level]}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              />
            )}

            {selectedSignal && (
              <Controller
                name="skipSimilar"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">Skip notifications for similar events</p>
                      <p className="text-xs text-muted-foreground">
                        When enabled, only the first event in a group of similar events will trigger a notification.
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
                  <span className="text-xs font-medium text-muted-foreground">
                    Notification would have triggered {totalEventCount} time{totalEventCount === 1 ? "" : "s"} for the
                    past {dateRangeLabel}
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
                    name="channelId"
                    control={control}
                    render={({ field, fieldState }) => (
                      <div className="grid gap-2">
                        <Label className="text-xs font-normal text-muted-foreground">Slack Channel</Label>
                        {isLoadingChannels ? (
                          <Skeleton className="h-7 w-full" />
                        ) : (
                          <>
                            <div className="flex gap-2">
                              <Combobox
                                items={channelItems}
                                value={field.value || null}
                                setValue={(v) => field.onChange(v ?? "")}
                                placeholder="Select a channel (optional)"
                                noMatchText="No channels found."
                                triggerClassName={cn("flex-1 h-7 text-xs", fieldState.error && "border-destructive")}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                disabled={!channelId || isTesting}
                                onClick={handleTest}
                              >
                                <Loader2 className={cn("hidden", { "animate-spin block mr-1": isTesting })} size={14} />
                                {!isTesting && <Send className="size-3.5 mr-1" />}
                                Test
                              </Button>
                            </div>
                            {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                          </>
                        )}
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
          </div>
        </ScrollArea>
        <div className="flex justify-end px-4 py-3 border-t">
          <Button type="submit" disabled={isSubmitting || (!isEditMode && !emailEnabled && !channelId)}>
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
