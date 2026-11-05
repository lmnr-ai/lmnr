import { useMemo } from "react";

import RegularTimelineToggle from "@/components/traces/session-view/session-panel/regular-timeline-toggle";
import { useSessionViewStore } from "@/components/traces/session-view/store";
import { computeTraceStats, StatsShields } from "@/components/traces/stats-shields";

/** Session stats + timeline toggle, same as the classic session view's header. */
export default function ChatSessionHeader() {
  const traces = useSessionViewStore((s) => s.traces);
  const stats = useMemo(() => (traces.length === 0 ? null : computeTraceStats(traces)), [traces]);

  if (!stats) return null;

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 px-2">
      <StatsShields stats={stats} />
      <RegularTimelineToggle />
    </div>
  );
}
