// TODO: remove — testing only (render-variant 2).
// Logic copied verbatim from the session-view trace card's collapsed body
// (components/traces/session-view/session-panel/trace-item.tsx) — input pill +
// last LLM span output, no header row, no expanding. Intentionally a copy, not
// an import of TraceItem.
"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";

import { spanToListSpan } from "@/components/traces/session-view/utils";
import { useBatchedTraceIO } from "@/components/traces/sessions-table/use-batched-trace-io";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { InputItem, SpanItem } from "@/components/traces/trace-view/transcript/item";
import { Skeleton } from "@/components/ui/skeleton";

import { useDebuggerSessionViewStore } from "./store";

export default function TraceIOCard({ traceId }: { traceId: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  const openSidePanel = useDebuggerSessionViewStore((state) => state.openSidePanel);

  const { previews } = useBatchedTraceIO(projectId, [traceId]);
  const traceIO = previews[traceId];

  const lastFullSpan = useMemo(() => {
    if (!traceIO?.outputSpan) return null;
    return traceIO.outputSpan as unknown as TraceViewSpan;
  }, [traceIO?.outputSpan]);

  const lastSpan = useMemo(() => {
    if (!lastFullSpan) return null;
    return spanToListSpan(lastFullSpan);
  }, [lastFullSpan]);

  return (
    <div className="flex flex-col">
      {!traceIO ? (
        <>
          <div className="border-b border-[rgba(232,232,232,0.1)]">
            <InputItem text={null} isLoading className="bg-transparent" />
          </div>
          <div className="flex flex-col gap-2 px-3 py-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        </>
      ) : !lastSpan ? (
        <div className="px-3 py-3 text-xs text-muted-foreground text-center">No LLM spans in this trace</div>
      ) : (
        <>
          <div className="border-b border-[rgba(232,232,232,0.1)]">
            <InputItem text={traceIO.inputPreview ?? null} isLoading={false} className="bg-transparent" />
          </div>
          <SpanItem
            span={lastSpan}
            fullSpan={lastFullSpan ?? undefined}
            output={traceIO.outputPreview}
            onSpanSelect={(s) => openSidePanel(traceId, s.spanId)}
            isSelected={false}
          />
        </>
      )}
    </div>
  );
}
