"use client";

import { InputItem } from "@/components/traces/trace-view/transcript/item";
import { CollapsedPreviewBlock } from "@/components/traces/trace-view/transcript/item/collapsed-preview-block";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils.ts";

import { useSessionViewBaseStore } from "../store";

interface TraceCollapsedBodyProps {
  trace: TraceRow;
}

/**
 * The collapsed-trace card body — the trace's extracted agent input + output
 * (from `traces_agg_v0.agent_input` / `agent_output`, carried on the trace row).
 * Rendered as its OWN virtual row (`trace-collapsed-body`) so the trace-header
 * row above it stays a uniform sticky ~40px header. Visually stitches under the
 * header card: side + bottom borders + bottom rounding continue the card whose
 * top edge is the header row.
 */
export default function TraceCollapsedBody({ trace }: TraceCollapsedBodyProps) {
  const spansError = useSessionViewBaseStore((s) => s.traceSpansError[trace.id]);

  const agentInput = trace.agentInput || null;
  const agentOutput = trace.agentOutput || null;

  return (
    <div
      data-collapsed-body
      className="flex flex-col overflow-hidden rounded-b-lg border-x border-b border-[rgba(232,232,232,0.1)] bg-muted/75"
    >
      {spansError ? (
        <div className="px-3 py-2 text-xs text-destructive text-center">{spansError}</div>
      ) : !agentInput && !agentOutput ? (
        <div className="px-3 py-3 text-xs text-muted-foreground text-center">
          No input or output extracted for this trace
        </div>
      ) : (
        <>
          {agentInput && (
            <div
              className={cn("border-[rgba(232,232,232,0.1)]", {
                "border-b": agentOutput,
              })}
            >
              <InputItem text={agentInput} isLoading={false} className="bg-transparent" />
            </div>
          )}
          {agentOutput && (
            <div className="px-3 py-2">
              <CollapsedPreviewBlock text={agentOutput} isLoading={false} label="Output" variant="collapsed" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
