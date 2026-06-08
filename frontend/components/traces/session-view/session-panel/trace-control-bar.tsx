import { GanttChart } from "lucide-react";
import { shallow } from "zustand/shallow";

import Metadata from "@/components/traces/trace-view/metadata";
import ViewToggle, { type ViewTab } from "@/components/traces/trace-view/view-toggle";
import { Button } from "@/components/ui/button";
import { type Feature, track } from "@/lib/posthog";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { useSessionViewBaseStore } from "../store";

interface TraceControlBarProps {
  trace: TraceRow;
  /** Which analytics feature to attribute view switches to. Defaults to "sessions". */
  analyticsFeature?: Extract<Feature, "sessions" | "debugger_sessions">;
}

/** Normalize TraceRow.metadata to a JSON string for the read-only Metadata
 *  popover. The /traces REST path delivers a JSON string at runtime while the
 *  debugger store normalizes to an object — handle both. Empty / `{}` → hidden. */
function metadataToString(metadata: TraceRow["metadata"] | string | undefined): string | undefined {
  if (!metadata) return undefined;
  if (typeof metadata === "string") {
    const trimmed = metadata.trim();
    return trimmed === "" || trimmed === "{}" ? undefined : metadata;
  }
  return Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined;
}

/** Per-trace Tree/Transcript + Content toggle and Metadata button. Rendered in
 *  the expanded trace header's control strip in both session surfaces. */
export default function TraceControlBar({ trace, analyticsFeature = "sessions" }: TraceControlBarProps) {
  const { mode, showContent, setTraceViewMode, toggleTraceShowTreeContent, isTimelineOpen, toggleTimelineOpen } =
    useSessionViewBaseStore(
      (s) => ({
        mode: s.traceViewModes[trace.id] ?? "transcript",
        showContent: s.traceShowTreeContent[trace.id] ?? true,
        setTraceViewMode: s.setTraceViewMode,
        toggleTraceShowTreeContent: s.toggleTraceShowTreeContent,
        isTimelineOpen: s.timelineOpenTraceIds.has(trace.id),
        toggleTimelineOpen: s.toggleTimelineOpen,
      }),
      shallow
    );

  const isDebugger = analyticsFeature === "debugger_sessions";

  const handleToggleTimeline = () => {
    track(analyticsFeature, "condensed_timeline_toggled", { traceId: trace.id, open: !isTimelineOpen });
    toggleTimelineOpen(trace.id);
  };

  const handleTabChange = (next: ViewTab) => {
    if (next !== mode) {
      track(analyticsFeature, "view_switched", { from: mode, to: next, traceId: trace.id });
    }
    setTraceViewMode(trace.id, next);
  };

  const metaString = metadataToString(trace.metadata as TraceRow["metadata"] | string | undefined);

  return (
    <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex">
        <ViewToggle
          tab={mode}
          onTabChange={handleTabChange}
          showContent={showContent}
          onToggleContent={() => toggleTraceShowTreeContent(trace.id)}
        />
        <Metadata metadata={metaString} />
      </div>

      {isDebugger && (
        <Button
          onClick={handleToggleTimeline}
          variant="outline"
          className={cn(
            "h-6 text-xs px-1.5",
            isTimelineOpen ? "border-primary text-primary hover:bg-primary/10" : "hover:bg-secondary"
          )}
        >
          <GanttChart size={14} className="mr-1" />
          Timeline
        </Button>
      )}
    </div>
  );
}
