"use client";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import { InputItem, OutputItem } from "@/components/traces/trace-view/transcript/item";
import { Skeleton } from "@/components/ui/skeleton";
import { SpanType, type TraceRow } from "@/lib/traces/types";

import { useSessionViewBaseStore } from "../store";

interface TraceCollapsedBodyProps {
  trace: TraceRow;
}

/**
 * The collapsed-trace card body — the trace's extracted agent input (from
 * `traces_v0.agent_input`, carried on the trace row) + output (from the
 * `trace_outputs` view, lazily fetched into the store's `agentOutputs`).
 * Rendered as its OWN virtual row (`trace-collapsed-body`) so the trace-header
 * row above it stays a uniform sticky ~40px header. Visually stitches under the
 * header card: side + bottom borders + bottom rounding continue the card whose
 * top edge is the header row.
 */
export default function TraceCollapsedBody({ trace }: TraceCollapsedBodyProps) {
  const spansError = useSessionViewBaseStore((s) => s.traceSpansError[trace.id]);
  // Extracted output from the trace_outputs view. `undefined` = not yet fetched.
  const output = useSessionViewBaseStore((s) => s.agentOutputs[trace.id]);

  const agentInput = trace.agentInput || null;
  const agentOutput = output || null;
  // Output not resolved yet (undefined) → show a skeleton output row.
  // Suppresses the "nothing extracted" message while the fetch is in flight so
  // it doesn't flash before the output lands.
  const outputPending = output === undefined;

  return (
    <div
      data-collapsed-body
      className="flex flex-col overflow-hidden rounded-b-lg border-x border-b border-[rgba(232,232,232,0.1)] bg-muted/75 divide-y divide-[rgba(232,232,232,0.1)]"
    >
      {spansError ? (
        <div className="px-3 py-2 text-xs text-destructive text-center">{spansError}</div>
      ) : !agentInput && !agentOutput && !outputPending ? (
        <div className="px-3 py-3 text-xs text-muted-foreground text-center">
          No input or output extracted for this trace
        </div>
      ) : (
        <>
          {agentInput && <InputItem text={agentInput} isLoading={false} className="bg-transparent" />}
          {agentOutput ? (
            <OutputItem text={agentOutput} isLoading={false} className="bg-transparent" />
          ) : outputPending ? (
            // Mirror OutputItem's layout (icon + label header, then a clamped body)
            // so the skeleton→content swap is roughly height-neutral and doesn't
            // resize this virtual row under the user while scrolling.
            <div className="flex flex-col flex-1 min-w-0 gap-1 py-2 pl-1 pr-2 border-l-4 border-l-transparent">
              <div className="flex items-center gap-2 min-w-0">
                <SpanTypeIcon size={14} containerWidth={20} containerHeight={20} spanType={SpanType.LLM} />
                <span className="text-sm font-medium whitespace-nowrap shrink-0">Output</span>
              </div>
              <div className="flex flex-col gap-1 pl-7">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
