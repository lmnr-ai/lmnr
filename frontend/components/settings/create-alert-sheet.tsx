"use client";

import { Loader2, Send } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { type SignalRow } from "@/lib/actions/signals";
import { type SlackChannel } from "@/lib/actions/slack";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, swrFetcher } from "@/lib/utils";

interface CreateAlertSheetProps {
  projectId: string;
  workspaceId: string;
  integrationId: string;
  onCreated: () => void;
}

const CHART_FIELDS = ["count"] as const;

export default function CreateAlertSheet({ projectId, workspaceId, integrationId, onCreated }: CreateAlertSheetProps) {
  const [open, setOpen] = useState(false);
  const [alertName, setAlertName] = useState("");
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

  const totalEventCount = useMemo(() => chartData.reduce((sum, d) => sum + d.count, 0), [chartData]);

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
    setAlertName("");
    setSelectedSignalName("");
    setSelectedChannelId("");
    setDateRange({ pastHours: "168" });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!selectedSignal || !selectedChannelId || !alertName.trim()) return;

    setIsCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: alertName.trim(),
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
  }, [
    projectId,
    integrationId,
    alertName,
    selectedSignal,
    selectedChannelId,
    selectedChannel,
    onCreated,
    resetForm,
    toast,
  ]);

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

  const canCreate = alertName.trim() && selectedSignalName && selectedChannelId && !isCreating;

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
              <Label>Name</Label>
              <Input
                placeholder="e.g. High error rate alert"
                value={alertName}
                onChange={(e) => setAlertName(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Signal</Label>
              <p className="text-xs text-muted-foreground">Choose the signal that will trigger alert.</p>
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
                  <SelectContent className="max-w-[var(--radix-select-trigger-width)]">
                    {signalsData?.items?.map((s) => (
                      <SelectItem key={s.id} value={s.name} description={s.prompt}>
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
                      <Loader2 className={cn("hidden", { "animate-spin block mr-1": isTesting })} size={14} />
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
