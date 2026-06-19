"use client";

import { format } from "date-fns";
import { X } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { parseUtcTimestamp } from "@/components/chart-builder/charts/utils";
import { normalizeTimeRange } from "@/components/charts/time-series-chart/utils";
import { useDashboardSelectionStore } from "@/components/dashboards/dashboard-selection-store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

const formatRange = (startTs: string, endTs: string) => {
  const start = parseUtcTimestamp(startTs);
  const end = parseUtcTimestamp(endTs);

  // Same calendar day — collapse the right side to just the time.
  if (format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd")) {
    return `${format(start, "MMM d, HH:mm")} – ${format(end, "HH:mm")}`;
  }
  return `${format(start, "MMM d, HH:mm")} – ${format(end, "MMM d, HH:mm")}`;
};

const formatDuration = (startMs: number, endMs: number) => {
  const diffMs = Math.abs(endMs - startMs);
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
};

export default function SelectionToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { projectId } = useParams();

  const { startLabel, endLabel, isDragging, clearSelection } = useDashboardSelectionStore((s) => ({
    startLabel: s.startLabel,
    endLabel: s.endLabel,
    isDragging: s.isDragging,
    clearSelection: s.clearSelection,
  }));

  const normalized = useMemo(() => {
    if (!startLabel || !endLabel) return null;
    return normalizeTimeRange(startLabel, endLabel);
  }, [startLabel, endLabel]);

  const applyTimeRange = useCallback(() => {
    if (!normalized) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("pastHours");
    params.set("startDate", parseUtcTimestamp(normalized.start).toISOString());
    params.set("endDate", parseUtcTimestamp(normalized.end).toISOString());
    router.push(`${pathname}?${params.toString()}`);
    clearSelection();
  }, [normalized, searchParams, pathname, router, clearSelection]);

  const openInTraces = useCallback(() => {
    if (!normalized || !projectId) return;
    const params = new URLSearchParams();
    params.set("startDate", parseUtcTimestamp(normalized.start).toISOString());
    params.set("endDate", parseUtcTimestamp(normalized.end).toISOString());
    window.open(`/project/${projectId}/traces?${params.toString()}`, "_blank");
    clearSelection();
  }, [normalized, projectId, clearSelection]);

  const isVisible = !!startLabel && !!endLabel && !isDragging && !!normalized;

  return (
    <Popover open={isVisible}>
      <PopoverAnchor asChild>
        <div className="absolute inset-x-0 bottom-0 h-0" />
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={clearSelection}
        onEscapeKeyDown={clearSelection}
        className="w-auto p-0 border-border bg-muted shadow-lg"
      >
        <div className="flex items-center justify-between gap-4 pl-4 pr-3 py-2 whitespace-nowrap">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-primary-foreground">
              {normalized && formatRange(normalized.start, normalized.end)}
            </span>
            <span className="text-secondary-foreground">
              {normalized && `(${formatDuration(normalized.startTime, normalized.endTime)})`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="bg-transparent border-primary-foreground/20"
              variant="outline"
              size="sm"
              onClick={applyTimeRange}
            >
              Zoom to selection
            </Button>
            <Button
              className="bg-transparent border-primary-foreground/20"
              variant="outline"
              size="sm"
              onClick={openInTraces}
            >
              Open in traces
            </Button>
            <button
              onClick={clearSelection}
              className="text-muted-foreground hover:text-primary-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
