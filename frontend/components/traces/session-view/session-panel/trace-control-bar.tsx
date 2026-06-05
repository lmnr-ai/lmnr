import { shallow } from "zustand/shallow";

import Metadata from "@/components/traces/trace-view/metadata";
import ViewToggle, { type ViewTab } from "@/components/traces/trace-view/view-toggle";
import { type Feature, track } from "@/lib/posthog";
import { type TraceRow } from "@/lib/traces/types";

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
  const { mode, showContent, setTraceViewMode, toggleTraceShowTreeContent } = useSessionViewBaseStore(
    (s) => ({
      mode: s.traceViewModes[trace.id] ?? "transcript",
      showContent: s.traceShowTreeContent[trace.id] ?? true,
      setTraceViewMode: s.setTraceViewMode,
      toggleTraceShowTreeContent: s.toggleTraceShowTreeContent,
    }),
    shallow
  );

  const handleTabChange = (next: ViewTab) => {
    if (next !== mode) {
      track(analyticsFeature, "view_switched", { from: mode, to: next, traceId: trace.id });
    }
    setTraceViewMode(trace.id, next);
  };

  const metaString = metadataToString(trace.metadata as TraceRow["metadata"] | string | undefined);

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <ViewToggle
        tab={mode}
        onTabChange={handleTabChange}
        showContent={showContent}
        onToggleContent={() => toggleTraceShowTreeContent(trace.id)}
      />
      <Metadata metadata={metaString} />
    </div>
  );
}
