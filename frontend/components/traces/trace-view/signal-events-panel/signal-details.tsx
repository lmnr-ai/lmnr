"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { useSpanRefCallbacks } from "@/components/traces/trace-view/span-reference/use-span-ref-callbacks";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";

import SignalEvent from "./signal-event";
import { schemaFieldsToStructuredOutput } from "./utils";

/** The per-signal body rendered inside a panel tab. */
export default function SignalDetails({ traceId, signal }: { traceId: string; signal: TraceSignal }) {
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

  // No padding here: each event carries its own, so neither block is stuck with
  // the other's inset.
  return (
    <div className="flex min-w-0 flex-col">
      {events.length === 0 ? (
        <div className="px-2 py-2 text-sm text-muted-foreground">No events found</div>
      ) : (
        // Only a per-span signal has more than one event; otherwise this never renders.
        <div className="flex min-w-0 flex-col gap-3">
          {events.map((event) => (
            <SignalEvent
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
