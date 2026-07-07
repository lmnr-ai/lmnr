import { Skeleton } from "@/components/ui/skeleton";
import { type TraceRow } from "@/lib/traces/types";
import { formatDuration } from "@/lib/utils";

import { type SessionBlockView } from "./store";
import TraceSegment, { type TraceSegmentProps } from "./trace-segment";

type TraceBlockCellProps = Omit<TraceSegmentProps, "trace"> & {
  trace: TraceRow | undefined;
  rowState: "loading" | "loaded" | "missing" | undefined;
  nextBlock: SessionBlockView | undefined;
  tracesById: Map<string, TraceRow>;
};

/**
 * One trace block: skeleton while its row lazily loads, nothing when missing,
 * else the TraceSegment. The gap divider to the next run lives in this measured
 * cell keyed off the next BLOCK's type (stable), so it can't shift heights later.
 */
const TraceBlockCell = ({ trace, rowState, nextBlock, tracesById, ...segmentProps }: TraceBlockCellProps) => {
  const showDivider = nextBlock?.type === "trace";
  const nextTrace = showDivider ? tracesById.get(nextBlock.traceId) : undefined;

  if (!trace) {
    if (rowState === "missing") return null;
    return (
      <div className="flex flex-col gap-2 py-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // Gap needs both rows; render the divider without a duration until the next loads.
  const gapMs = nextTrace ? new Date(nextTrace.startTime).getTime() - new Date(trace.endTime).getTime() : undefined;

  return (
    <>
      <TraceSegment trace={trace} {...segmentProps} />
      {showDivider && (
        <div className="px-2 flex h-20 items-center justify-center">
          <div className="w-full border-b" />
          {formatDuration(gapMs) && (
            <span className="shrink-0 px-2 text-xs text-muted-foreground">{formatDuration(gapMs)}</span>
          )}
          <div className="w-full border-b" />
        </div>
      )}
    </>
  );
};

export default TraceBlockCell;
