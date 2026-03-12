"use client";

import { Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import useSWR from "swr";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import { type EventsStatsDataPoint } from "@/components/signal/store";
import { Button } from "@/components/ui/button";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { type AlertWithDetails } from "@/lib/actions/alerts/types";
import { type SignalRow } from "@/lib/actions/signals";
import { type SlackChannel } from "@/lib/actions/slack";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, swrFetcher } from "@/lib/utils";

interface ManageAlertSheetProps {
  projectId: string;
  workspaceId: string;
  integrationId: string;
  alert?: AlertWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface AlertFormValues {
  name: string;
  signalName: string;
  channelId: string;
}

const CHART_FIELDS = ["count"] as const;

const DEFAULT_VALUES: AlertFormValues = {
  name: "",
  signalName: "",
  channelId: "",
};

export default function ManageAlertSheet({
  projectId,
  workspaceId,
  integrationId,
  alert,
  open,
  onOpenChange,
  onSaved,
}: ManageAlertSheetProps) {
  const isEditMode = !!alert;

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

  const { data: signalsData, isLoading: isLoadingSignals } = useSWR<{ items: SignalRow[] }>(
    open ? `/api/projects/${projectId}/signals?pageNumber=0&pageSize=100` : null,
    swrFetcher
  );

  useEffect(() => {
    if (!open || !alert || !signalsData) return;

    const signal = signalsData.items?.find((s) => s.id === alert.sourceId);
    const slackTarget = alert.targets.find((t) => t.type === "slack");

    reset({
      name: alert.name,
      signalName: signal?.name ?? "",
      channelId: slackTarget?.channelId ?? "",
    });
  }, [open, alert, signalsData, reset]);

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

  const statsUrl = useTimeSeriesStatsUrl({
    baseUrl: selectedSignal ? `/api/projects/${projectId}/signals/${selectedSignal.id}/events/stats` : "",
    chartContainerWidth,
    pastHours: dateRange.pastHours ?? null,
    startDate: dateRange.startDate ?? null,
    endDate: dateRange.endDate ?? null,
  });

  const { data: eventsStats, isLoading: isLoadingStats } = useSWR<{ items: EventsStatsDataPoint[] }>(
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
    open && selectedSignal ? `/api/workspaces/${workspaceId}/slack/channels` : null,
    swrFetcher
  );

  const selectedChannel = useMemo(() => channels?.find((ch) => ch.id === channelId), [channels, channelId]);

  const resetForm = useCallback(() => {
    reset(DEFAULT_VALUES);
    setDateRange({ pastHours: "168" });
  }, [reset]);

  const onSubmit = useCallback(
    async (data: AlertFormValues) => {
      if (!selectedSignal) return;

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
            targets: [
              {
                type: "slack",
                integrationId,
                channelId: data.channelId,
                channelName: selectedChannel?.name ?? "",
              },
            ],
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
      selectedSignal,
      selectedChannel,
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

  const sheetContent = (
    <SheetContent side="right" className="min-w-[50vw] w-full flex flex-col gap-0">
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
                  {isLoadingSignals ? (
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
              <Controller
                name="channelId"
                control={control}
                rules={{ required: "Slack channel is required" }}
                render={({ field, fieldState }) => (
                  <div className="grid gap-2">
                    <Label>Slack Channel</Label>
                    <p className="text-xs text-muted-foreground">Notifications will be sent to this channel.</p>
                    {isLoadingChannels ? (
                      <Skeleton className="h-7 w-full" />
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className={cn("flex-1", fieldState.error && "border-destructive")}>
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
          </div>
        </ScrollArea>
        <div className="flex justify-end px-4 py-3 border-t">
          <Button type="submit" disabled={isSubmitting}>
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
