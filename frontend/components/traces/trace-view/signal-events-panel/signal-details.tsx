"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { jsonSchemaToSchemaFields, type SchemaField } from "@/components/signals/utils";
import { type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import { useSpanRefCallbacks } from "@/components/traces/trace-view/span-reference/use-span-ref-callbacks";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { type TraceSignal, type TraceSignalEvent } from "@/components/traces/trace-view/store/base";
import Markdown from "@/components/traces/trace-view/transcript/markdown.tsx";
import { cn } from "@/lib/utils";

import ClusterButton, { EnumPill, OpenInSignalsButton } from "./cluster-button";
import { schemaFieldsToStructuredOutput } from "./utils";

interface Props {
  traceId: string;
  signal: TraceSignal;
}

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

function PayloadValue({
  value,
  field,
  spanRefCallbacks,
}: {
  value: unknown;
  field: SchemaField;
  spanRefCallbacks?: SpanReferenceCallbacks;
}) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }
  switch (field.type) {
    case "boolean":
      return <span>{value ? "true" : "false"}</span>;
    case "enum":
      return <EnumPill value={String(value)} />;
    case "number":
      return <span className="tabular-nums">{String(value)}</span>;
    case "string":
      return (
        <span className="whitespace-pre-wrap break-words">
          <Markdown contentClassName="pb-0" output={String(value)} spanRefCallbacks={spanRefCallbacks} />
        </span>
      );
  }
}

/**
 * One event: the clusters it landed in, then its payload rendered field-by-field
 * from the signal's schema.
 *
 * No card around it. A card is a separator, and a separator needs something to
 * separate from — but a signal produces one event per trace almost always, so
 * the box drew a boundary around the only thing in the panel, inside a panel
 * that already has a border. Severity left this row too: it is a property of the
 * card, and the card already has a header.
 */
function Event({
  event,
  projectId,
  signalId,
  traceId,
  validFields,
  spanRefCallbacks,
  highlighted,
}: {
  event: TraceSignalEvent;
  projectId: string;
  signalId: string;
  traceId: string;
  validFields: SchemaField[];
  spanRefCallbacks?: SpanReferenceCallbacks;
  highlighted?: boolean;
}) {
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
      className={cn("flex min-w-0 flex-col", highlighted && "border-l-2 border-signal/60")}
    >
      {/* The SIDE inset is the fields' one, not its own: the cluster row and the
          payload below it are two blocks in one column, and a column has one left
          edge. Only the vertical inset is the row's own, because that one is
          genuinely about the buttons. */}
      <div className="flex min-w-0 items-center gap-1.5 px-3 py-2">
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
          // A cluster button already links into the signal page, scoped to that
          // cluster and that event. Alongside one, the bare link is a second and
          // worse copy of it; with none, it is the only way out of the trace.
          <OpenInSignalsButton href={`/project/${projectId}/signals/${signalId}?traceId=${traceId}`} />
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2.5 px-3 pb-0.5">
        {validFields.map((field) => (
          <div key={field.name} className="flex flex-col gap-0.5">
            <div className="text-xs font-medium text-signal-key">{field.name}</div>
            <div className="text-sm leading-relaxed text-secondary-foreground">
              <PayloadValue value={parsed[field.name]} field={field} spanRefCallbacks={spanRefCallbacks} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The per-signal body rendered inside a panel tab. */
export default function SignalDetails({ traceId, signal }: Props) {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const highlightedEventId = searchParams.get("eventId");
  const { selectSpanById, spans } = useTraceViewStore(
    (state) => ({
      selectSpanById: state.selectSpanById,
      spans: state.spans,
    }),
    shallow
  );

  const events = signal.events ?? [];

  const schemaFields = useMemo(
    () => jsonSchemaToSchemaFields(schemaFieldsToStructuredOutput(signal.schemaFields)),
    [signal.schemaFields]
  );
  const validFields = useMemo(() => schemaFields.filter((f) => f.name.trim()), [schemaFields]);

  const spanRefCallbacks = useSpanRefCallbacks({
    spans,
    onSelectSpan: selectSpanById,
  });

  return (
    // No padding here: the cluster row and the field block each carry their own,
    // so neither is stuck with the other's inset.
    <div className="flex min-w-0 flex-col">
      {events.length === 0 ? (
        <div className="px-2 py-2 text-sm text-muted-foreground">No events found</div>
      ) : (
        // Only a per-span signal ever has more than one event, and then they need
        // telling apart; with one event this gap never renders.
        <div className="flex min-w-0 flex-col gap-3">
          {events.map((event) => (
            <Event
              key={event.id}
              event={event}
              projectId={projectId as string}
              signalId={signal.signalId}
              traceId={traceId}
              validFields={validFields}
              spanRefCallbacks={spanRefCallbacks}
              highlighted={event.id === highlightedEventId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
