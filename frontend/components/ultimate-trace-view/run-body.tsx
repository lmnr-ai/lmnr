// TODO: remove — testing only. Switches a run's body between render variants
// driven by the temporary variant store. Collapse back to a plain <Timeline />
// once the approach is chosen.
"use client";

import { cn } from "@/lib/utils";

import RunHeader from "./run-header";
import { useUltimateTraceViewStore } from "./store";
import Timeline from "./timeline";
import { useTmpVariantStore } from "./tmp-variant-store";
import TraceIOCard from "./trace-io-card";

export default function RunBody({ traceId, index, total }: { traceId: string; index: number; total: number }) {
  const variant = useTmpVariantStore((s) => s.variant);
  // Highlight the card while its trace is open in the trace-view side panel.
  const isOpenInSidePanel = useUltimateTraceViewStore((s) => s.sidePanelTraceId === traceId);
  const borderColor = isOpenInSidePanel ? "border-primary/70" : "border-border";

  // Variant 2: session-view-style input/output only.
  if (variant === 2) {
    return (
      <div className={cn("flex flex-col overflow-hidden rounded-md border bg-secondary w-full", borderColor)}>
        <RunHeader traceId={traceId} index={index} total={total} />
        <TraceIOCard traceId={traceId} />
      </div>
    );
  }

  // Variant 3: hybrid — timeline left, input/output right.
  if (variant === 3) {
    return (
      <div className={cn("flex flex-col overflow-hidden rounded-md border bg-secondary w-full", borderColor)}>
        <RunHeader traceId={traceId} index={index} total={total} />
        <div className="flex">
          <div className="flex h-[200px] w-1/2 flex-col border-r border-border">
            <Timeline traceId={traceId} />
          </div>
          <div className="max-h-[200px] w-1/2 overflow-y-auto">
            <TraceIOCard traceId={traceId} />
          </div>
        </div>
      </div>
    );
  }

  // Variant 1 (default): current timeline.
  return (
    <div className={cn("flex h-[160px] flex-col overflow-hidden rounded-md border w-full", borderColor)}>
      <Timeline traceId={traceId} />
    </div>
  );
}
