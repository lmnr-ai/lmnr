"use client";

import { useEffect, useMemo, useRef } from "react";

import { type SchemaField } from "@/components/signals/utils";
import { type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import { type TraceSignalEvent } from "@/components/traces/trace-view/store/base";
import { cn } from "@/lib/utils";

import ClusterButton from "./cluster-button";
import { SPAN_CHIP_SURFACE } from "./constants";
import OpenInSignalsButton from "./open-in-signals-button";
import PayloadValue from "./payload-value";

function parsePayload(payload: string): Record<string, unknown> {
  try {
    const result = JSON.parse(payload);
    if (result == null || typeof result !== "object" || Array.isArray(result)) {
      return {};
    }
    return result;
  } catch {
    return {};
  }
}

interface Props {
  event: TraceSignalEvent;
  projectId: string;
  signalId: string;
  traceId: string;
  validFields: SchemaField[];
  spanRefCallbacks?: SpanReferenceCallbacks;
  highlighted?: boolean;
}

/** One event, with no card around it: a signal produces one event per trace in
 *  all but a handful of cases, so the box bordered the panel's only content. */
export default function SignalEvent({
  event,
  projectId,
  signalId,
  traceId,
  validFields,
  spanRefCallbacks,
  highlighted,
}: Props) {
  const parsed = useMemo(() => parsePayload(event.payload), [event.payload]);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted]);

  return (
    <div
      ref={ref}
      // A deep-linked event still has to be findable, so the highlight is a rule
      // down the left edge rather than a ring around a box that is no longer drawn.
      className={cn("flex min-w-0 flex-col", highlighted && "border-l-2 border-border")}
    >
      {/* Half the fields' inset, because a chip is a filled box with its own:
          6 + the chip's 6 puts the LABEL on 12, level with the field labels
          under it. The column keeps its one left edge; the text sits on it
          rather than the box. */}
      <div className="flex min-w-0 items-center gap-1.5 px-1.5 py-2">
        {event.leafClusters.length > 0 ? (
          event.leafClusters.map((cluster) => (
            <ClusterButton
              key={cluster.id}
              shrinkable
              cluster={cluster}
              href={`/project/${projectId}/signals/${signalId}?clusterId=${cluster.id}&traceId=${traceId}&eventId=${event.id}`}
            />
          ))
        ) : (
          <OpenInSignalsButton href={`/project/${projectId}/signals/${signalId}?traceId=${traceId}`} />
        )}
      </div>

      {/* The span-chip override rides here: the chips come out of shipping
          markdown, so a descendant rule is the only way to reach them. The bottom
          inset clears the resize grip, which is absolute and sits over this. */}
      <div className={cn("flex min-w-0 flex-col gap-2.5 px-3 pb-2", SPAN_CHIP_SURFACE)}>
        {validFields.map((field) => (
          <div key={field.name} className="flex flex-col gap-0.5">
            <div className="text-xs font-medium text-muted-foreground">{field.name}</div>
            <div className="text-sm leading-relaxed text-secondary-foreground">
              <PayloadValue value={parsed[field.name]} field={field} spanRefCallbacks={spanRefCallbacks} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
