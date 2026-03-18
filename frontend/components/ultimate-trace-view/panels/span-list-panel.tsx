import { useCallback, useMemo } from "react";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import { type TraceViewSpan } from "@/components/traces/trace-view/store";
import { cn } from "@/lib/utils";

import { type PanelDescriptor, useUltimateTraceViewStore } from "../store";
import PanelWrapper from "./panel-wrapper";

interface SpanListPanelProps {
  panel: PanelDescriptor;
}

export default function SpanListPanel({ panel }: SpanListPanelProps) {
  const closePanel = useUltimateTraceViewStore((state) => state.closePanel);
  const openSpanViewPanel = useUltimateTraceViewStore((state) => state.openSpanViewPanel);
  const selectSpan = useUltimateTraceViewStore((state) => state.selectSpan);
  const selectedSpanId = useUltimateTraceViewStore((state) => state.selectedSpanId);
  const spans = useUltimateTraceViewStore((state) => state.traces.get(panel.traceId)?.spans ?? []);

  const filteredSpans = useMemo(() => {
    const spanIdSet = panel.data.spanIds ? new Set(panel.data.spanIds) : null;
    const filtered = spanIdSet ? spans.filter((s) => spanIdSet.has(s.spanId)) : spans;
    // Filter out DEFAULT spans like the list view does
    return filtered.filter((s) => s.spanType !== "DEFAULT");
  }, [spans, panel.data.spanIds]);

  const handleClose = useCallback(() => {
    closePanel(panel.key);
  }, [closePanel, panel.key]);

  const handleSpanClick = useCallback(
    (span: TraceViewSpan) => {
      if (span.pending) return;
      selectSpan(panel.traceId, span.spanId);
      openSpanViewPanel(panel.traceId, span.spanId);
    },
    [panel.traceId, selectSpan, openSpanViewPanel]
  );

  const title = panel.data.title ?? "Spans";

  return (
    <PanelWrapper title={`${title} (${filteredSpans.length})`} onClose={handleClose}>
      <div className="flex flex-col overflow-y-auto h-full styled-scrollbar">
        {filteredSpans.length === 0 ? (
          <div className="flex items-center justify-center p-8 text-sm text-secondary-foreground">No spans found</div>
        ) : (
          filteredSpans.map((span) => (
            <SpanListItem
              key={span.spanId}
              span={span}
              isSelected={selectedSpanId === span.spanId}
              onClick={handleSpanClick}
            />
          ))
        )}
      </div>
    </PanelWrapper>
  );
}

function SpanListItem({
  span,
  isSelected,
  onClick,
}: {
  span: TraceViewSpan;
  isSelected: boolean;
  onClick: (span: TraceViewSpan) => void;
}) {
  const displayName = span.spanType === "LLM" && span.model ? span.model : span.name;
  const durationMs = new Date(span.endTime).getTime() - new Date(span.startTime).getTime();

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "flex items-center gap-2 px-3 py-2 cursor-pointer border-l-2 hover:bg-secondary/80 active:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isSelected ? "bg-primary/5 border-l-primary" : "border-l-transparent"
      )}
      onClick={() => onClick(span)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(span);
        }
      }}
    >
      <SpanTypeIcon spanType={span.spanType} className={cn({ "text-muted-foreground bg-muted": span.pending })} />
      <div className="flex flex-col min-w-0 flex-1">
        <span className={cn("text-sm font-medium truncate", span.pending && "text-muted-foreground shimmer")}>
          {displayName}
        </span>
        <span className="text-xs text-muted-foreground">{durationMs}ms</span>
      </div>
    </div>
  );
}
