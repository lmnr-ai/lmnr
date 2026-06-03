"use client";

import RunBody from "./run-body";
import RunComment from "./run-comment";
import { traceAnchorId } from "./session-outline/utils";
import { useUltimateTraceViewStore } from "./store";

// One run in the article: its agent-authored comment, then the trace body.
export default function TraceSection({ traceId, index, total }: { traceId: string; index: number; total: number }) {
  const exists = useUltimateTraceViewStore((state) => state.traces.has(traceId));

  if (!exists) return null;

  return (
    <div className="flex flex-col items-center gap-8">
      <RunComment traceId={traceId} />
      {/* The chip in the outline anchors to the trace body (below its comment), so
          the comment's headings sort before the trace in the outline. */}
      <div id={traceAnchorId(traceId)} className="w-full scroll-mt-4">
        {/* TODO: remove — testing. RunBody switches render variants via the temporary store. */}
        <RunBody traceId={traceId} index={index} total={total} />
      </div>
    </div>
  );
}
