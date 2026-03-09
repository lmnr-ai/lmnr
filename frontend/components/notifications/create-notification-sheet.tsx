"use client";

import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import { type EventsStatsDataPoint } from "@/components/signal/store";
import { Button } from "@/components/ui/button";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { QUICK_RANGES } from "@/components/ui/date-range-filter/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { type SignalRow } from "@/lib/actions/signals";
import { type SlackChannel } from "@/lib/actions/slack";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, swrFetcher } from "@/lib/utils";

interface ActionItem {
  channelId: string;
  channelName: string;
}

interface CreateNotificationSheetProps {
  projectId: string;
  workspaceId: string;
  integrationId: string;
  onCreated: () => void;
}

const CHART_FIELDS = ["count"] as const;

export default function CreateNotificationSheet({
  projectId,
  workspaceId,
  integrationId,
  onCreated,
}: CreateNotificationSheetProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedSignalName, setSelectedSignalName] = useState("");
  const [actions, setActions] = useState<ActionItem[]>([{ channelId: "", channelName: "" }]);
  const [isCreating, setIsCreating] = useState(false);
  const [testingIndex, setTestingIndex] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<{ pastHours?: string; startDate?: string; endDate?: string }>({
    pastHours: "168",
  });
  const [chartContainerWidth, setChartContainerWidth] = useState<number | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  const handleDateRangeChange = useCallback((value: { pastHours?: string; startDate?: string; endDate?: string }) => {
    if (value.pastHours) {
      setDateRange({ pastHours: value.pastHours });
    } else if (value.startDate && value.endDate) {
      setDateRange({ startDate: value.startDate, endDate: value.endDate });
    }
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [selectedSignalName]);

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

  const totalTriggerCount = useMemo(() => chartData.reduce((sum, point) => sum + point.count, 0), [chartData]);

  const periodLabel = useMemo(() => {
    if (dateRange.pastHours) {
      const match = QUICK_RANGES.find((r) => r.value === dateRange.pastHours);
      return match ? match.name : `${dateRange.pastHours} hours`;
    }
    if (dateRange.startDate && dateRange.endDate) {
      return "selected period";
    }
    return "1 week";
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

  const resetForm = useCallback(() => {
    setName("");
    setSelectedSignalName("");
    setActions([{ channelId: "", channelName: "" }]);
    setDateRange({ pastHours: "168" });
  }, []);

  const handleChannelChange = useCallback(
    (index: number, channelId: string) => {
      const channel = channels?.find((ch) => ch.id === channelId);
      setActions((prev) => prev.map((a, i) => (i === index ? { channelId, channelName: channel?.name ?? "" } : a)));
    },
    [channels]
  );

  const addAction = useCallback(() => {
    setActions((prev) => [...prev, { channelId: "", channelName: "" }]);
  }, []);

  const removeAction = useCallback((index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleTest = useCallback(
    async (index: number) => {
      const action = actions[index];
      if (!action?.channelId) return;

      setTestingIndex(index);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/slack/subscriptions/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId: action.channelId }),
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
        setTestingIndex(null);
      }
    },
    [workspaceId, actions, toast]
  );

  const handleCreate = useCallback(async () => {
    const validActions = actions.filter((a) => a.channelId);
    if (!name.trim() || !selectedSignalName || validActions.length === 0) return;

    setIsCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          triggerType: "signal",
          triggerConfig: { signalName: selectedSignalName },
          actions: validActions.map((a) => ({
            channelId: a.channelId,
            channelName: a.channelName,
            integrationId,
          })),
        }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({ error: "Failed to create notification" }))) as { error: string };
        throw new Error(error?.error ?? "Failed to create notification");
      }

      toast({ title: "Notification created" });
      onCreated();
      setOpen(false);
      resetForm();
    } catch (e) {
      toast({
        title: "Error creating notification",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Failed to create notification",
      });
    } finally {
      setIsCreating(false);
    }
  }, [name, selectedSignalName, actions, projectId, integrationId, onCreated, resetForm, toast]);

  const validActions = actions.filter((a) => a.channelId);
  const canCreate = name.trim() && selectedSignalName && validActions.length > 0 && !isCreating;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      <SheetTrigger asChild>
        <Button icon="plus" variant="outline" className="w-fit">
          Notification
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="min-w-[50vw] w-full flex flex-col gap-0">
        <SheetHeader className="py-4 px-4 border-b">
          <SheetTitle>New notification</SheetTitle>
          <SheetDescription>Configure signal notifications to Slack channels.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-6 p-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Alert on critical errors"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Signal</Label>
              <p className="text-xs text-muted-foreground">
                Choose the signal event that will trigger this notification.
              </p>
              {isLoadingSignals ? (
                <Skeleton className="h-7 w-full" />
              ) : (
                <Select
                  value={selectedSignalName}
                  onValueChange={(value) => {
                    setSelectedSignalName(value);
                    setActions([{ channelId: "", channelName: "" }]);
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
                    Would have triggered{" "}
                    <span className="text-secondary-foreground font-semibold">
                      {totalTriggerCount.toLocaleString()}
                    </span>{" "}
                    time{totalTriggerCount !== 1 ? "s" : ""} in the past {periodLabel}
                  </span>
                  <DateRangeFilter
                    mode="state"
                    value={dateRange}
                    onChange={handleDateRangeChange}
                    className="h-7 text-xs"
                  />
                </div>
                <div ref={chartContainerRef}>
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
                <Label>Send to</Label>
                <p className="text-xs text-muted-foreground">
                  Choose Slack channels to send notifications to. For private channels, invite the bot first.
                </p>

                <div className="flex flex-col gap-3">
                  {actions.map((action, index) => (
                    <div key={index} className="flex items-center gap-2">
                      {isLoadingChannels ? (
                        <div className="flex-1 h-9 rounded-md border bg-muted/30 animate-pulse" />
                      ) : (
                        <Select value={action.channelId} onValueChange={(val) => handleChannelChange(index, val)}>
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
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={!action.channelId || testingIndex === index}
                        onClick={() => handleTest(index)}
                      >
                        <Loader2 className={cn("hidden", { "animate-spin block": testingIndex === index })} size={14} />
                        {testingIndex !== index && <Send className="size-3.5" />}
                      </Button>
                      {actions.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeAction(index)}>
                          <Trash2 size={14} className="text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <Button variant="outline" className="w-fit" onClick={addAction}>
                  <Plus size={14} className="mr-1" />
                  Add channel
                </Button>
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
