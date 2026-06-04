"use client";

import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import { type TraceIOEntry } from "@/components/traces/sessions-table/use-batched-trace-io";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { InputItem, SpanItem } from "@/components/traces/trace-view/transcript/item";
import { Skeleton } from "@/components/ui/skeleton";
import { type TraceRow } from "@/lib/traces/types";

import { useSessionViewBaseStore } from "../store";
import { spanToListSpan } from "../utils";

interface TraceCollapsedBodyProps {
  trace: TraceRow;
  traceIO?: TraceIOEntry | null;
}

/**
 * The collapsed-trace card body — input preview + last-span preview (or the
 * loading / error / "No LLM spans" states). Rendered as its OWN virtual row
 * (`trace-collapsed-body`) so the trace-header row above it stays a uniform
 * sticky ~40px header. Visually stitches under the header card: side + bottom
 * borders + bottom rounding continue the card whose top edge is the header row.
 */
export default function TraceCollapsedBody({ trace, traceIO }: TraceCollapsedBodyProps) {
  const { spansError, selectedSpan, setSelectedSpan } = useSessionViewBaseStore(
    (s) => ({
      spansError: s.traceSpansError[trace.id],
      selectedSpan: s.selectedSpan,
      setSelectedSpan: s.setSelectedSpan,
    }),
    shallow
  );

  const lastFullSpan = useMemo(() => {
    if (!traceIO?.outputSpan) return null;
    return traceIO.outputSpan as unknown as TraceViewSpan;
  }, [traceIO?.outputSpan]);

  const lastSpan = useMemo(() => {
    if (!lastFullSpan) return null;
    return spanToListSpan(lastFullSpan);
  }, [lastFullSpan]);

  return (
    <div className="flex flex-col overflow-hidden rounded-b-lg border-x border-b border-[rgba(232,232,232,0.1)] bg-muted/75">
      {spansError ? (
        <div className="px-3 py-2 text-xs text-destructive text-center">{spansError}</div>
      ) : !traceIO ? (
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
            onSpanSelect={(s) => setSelectedSpan({ traceId: trace.id, spanId: s.spanId })}
            isSelected={!!selectedSpan && selectedSpan.traceId === trace.id && selectedSpan.spanId === lastSpan.spanId}
          />
        </>
      )}
    </div>
  );
}
