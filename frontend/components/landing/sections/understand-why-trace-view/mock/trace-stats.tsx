import { CircleDollarSign, Clock3, Coins } from "lucide-react";
import { type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { formatCostNumber, formatDurationMs, formatTokensCompact } from "@/lib/traces/format";
import { cn } from "@/lib/utils";

import { DEMO_TRACE_TOTALS, type MockSpan } from "../../demo-trace";

interface Props {
  /** The run so far. Omit once it has finished — see below. */
  spans?: MockSpan[];
  className?: string;
}

/** Duration is every span's extent; tokens and cost count LLM spans ONLY. A
 *  tool span can carry stray usage values of its own, and summing those would
 *  double-count them into the total. */
const streamedStats = (spans: MockSpan[]) => ({
  durationMs: Math.max(...spans.map((s) => s.endMs)) - Math.min(...spans.map((s) => s.startMs)),
  totalTokens: spans.reduce((sum, s) => sum + (s.spanType === "LLM" ? s.totalTokens : 0), 0),
  totalCost: spans.reduce((sum, s) => sum + (s.spanType === "LLM" ? s.totalCost : 0), 0),
});

const Shield = ({ icon, value }: { icon: ReactNode; value: string }) => (
  <button type="button" className="min-w-8">
    <div className="flex space-x-1 items-center">
      {icon}
      <Label className="text-xs truncate">{value}</Label>
    </div>
  </button>
);

// Duration, tokens and cost for the whole run. They climb while it streams,
// then hand back to the trace's OWN totals once the caller stops passing
// `spans`, so they land on the real numbers rather than a re-sum of them.
const TraceStats = ({ spans, className }: Props) => {
  const stats = spans && spans.length > 0 ? streamedStats(spans) : DEMO_TRACE_TOTALS;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-1.5 py-0.5 rounded-md overflow-hidden text-xs font-mono min-w-0 bg-muted text-secondary-foreground",
        className
      )}
    >
      <Shield icon={<Clock3 size={12} className="min-w-3 min-h-3" />} value={formatDurationMs(stats.durationMs)} />
      <Shield icon={<Coins className="min-w-3" size={12} />} value={formatTokensCompact(stats.totalTokens)} />
      <Shield icon={<CircleDollarSign className="min-w-3" size={12} />} value={formatCostNumber(stats.totalCost)} />
    </div>
  );
};

export default TraceStats;
