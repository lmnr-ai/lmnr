"use client";

import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { parseUtcTimestamp } from "@/components/chart-builder/charts/utils";
import { normalizeTimeRange } from "@/components/charts/time-series-chart/utils";
import { useDashboardSelectionStore } from "@/components/dashboards/dashboard-selection-store";
import { Button } from "@/components/ui/button";

const formatRange = (startTs: string, endTs: string) => {
  const start = parseUtcTimestamp(startTs);
  const end = parseUtcTimestamp(endTs);
  const startStr = format(start, "MMM d, HH:mm");

  if (format(start, "MMM d") === format(end, "MMM d")) {
    return `${startStr} – ${format(end, "HH:mm")}`;
  }
  if (format(start, "MMM") === format(end, "MMM")) {
    return `${startStr} – ${format(end, "d, HH:mm")}`;
  }
  return `${startStr} – ${format(end, "MMM d, HH:mm")}`;
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
    params.set("startDate", normalized.start);
    params.set("endDate", normalized.end);
    router.push(`${pathname}?${params.toString()}`);
    clearSelection();
  }, [normalized, searchParams, pathname, router, clearSelection]);

  const openInTraces = useCallback(() => {
    if (!normalized || !projectId) return;
    const params = new URLSearchParams();
    params.set("startDate", normalized.start);
    params.set("endDate", normalized.end);
    window.open(`/project/${projectId}/traces?${params.toString()}`, "_blank");
    clearSelection();
  }, [normalized, projectId, clearSelection]);

  const isVisible = !!startLabel && !!endLabel && !isDragging && !!normalized;

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
          <motion.div
            initial={{ opacity: 0.8, y: 20, clipPath: "inset(0 20% 0 20%)" }}
            animate={{ opacity: 1, y: 0, clipPath: "inset(0 0% 0 0%)" }}
            exit={{ opacity: 0.8, y: 20, clipPath: "inset(0 20% 0 20%)" }}
            transition={{ duration: 0.1, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted pl-4 pr-3 py-2 shadow-lg whitespace-nowrap">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-primary-foreground">{formatRange(normalized!.start, normalized!.end)}</span>
                <span className="text-secondary-foreground">
                  ({formatDuration(normalized!.startTime, normalized!.endTime)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  className="bg-transparent border-primary-foreground/20"
                  variant="outline"
                  size="sm"
                  onClick={applyTimeRange}
                >
                  Apply time range
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
