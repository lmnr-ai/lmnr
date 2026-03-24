"use client";

import { Check, ExternalLink, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { jsonSchemaToSchemaFields, type SchemaField } from "@/components/signals/utils";
import { renderSpanReferences, type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { type EventRow } from "@/lib/events/types";

interface SignalTabProps {
  signalId: string;
  signalName: string;
  prompt: string;
  structuredOutput: Record<string, unknown>;
  events: EventRow[];
  traceId: string;
}

function parsePayload(payload: string): Record<string, unknown> {
  try {
    return JSON.parse(payload);
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
      return (
        <span className="inline-flex items-center gap-1.5">
          {value ? <Check className="size-4 text-green-500" /> : <X className="size-4 text-muted-foreground" />}
          <span className="text-secondary-foreground">{value ? "true" : "false"}</span>
        </span>
      );
    case "enum":
      return (
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {String(value)}
        </span>
      );
    case "number":
      return <span className="tabular-nums">{String(value)}</span>;
    case "string": {
      const text = String(value);
      if (spanRefCallbacks) {
        const rendered = renderSpanReferences(text, spanRefCallbacks);
        if (rendered) {
          return <span className="whitespace-pre-wrap break-words text-secondary-foreground">{rendered}</span>;
        }
      }
      return <span className="whitespace-pre-wrap break-words text-secondary-foreground">{text}</span>;
    }
  }
}

export default function SignalTab({ signalId, signalName, prompt, structuredOutput, events, traceId }: SignalTabProps) {
  const { projectId } = useParams();
  const openSignalInChat = useTraceViewStore((state) => state.openSignalInChat);
  const selectSpanById = useTraceViewStore((state) => state.selectSpanById);

  const schemaFields = useMemo(() => jsonSchemaToSchemaFields(structuredOutput), [structuredOutput]);
  const validFields = useMemo(() => schemaFields.filter((f) => f.name.trim()), [schemaFields]);

  const resolveSpanId = useCallback(
    async (sequentialId: string): Promise<string | null> => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/traces/${traceId}/agent/resolve-span?id=${sequentialId}`
        );
        if (response.ok) {
          const data = await response.json();
          return data.spanId;
        }
      } catch (error) {
        console.error("Error resolving span ID:", error);
      }
      return null;
    },
    [projectId, traceId]
  );

  const spanRefCallbacks = useMemo<SpanReferenceCallbacks>(
    () => ({
      resolveSpanId,
      onSelectSpan: selectSpanById,
    }),
    [resolveSpanId, selectSpanById]
  );

  // Show the most recent event
  const safeEvents = events ?? [];
  const latestEvent = safeEvents[0];
  const parsed = useMemo(() => (latestEvent ? parsePayload(latestEvent.payload) : {}), [latestEvent]);

  const handleOpenInChat = () => {
    const signalDefinition = `### ${signalName}\n${prompt}`;
    const eventPayload = latestEvent ? latestEvent.payload : "No events found";
    openSignalInChat(signalDefinition, eventPayload);
  };

  return (
    <div className="py-1.5 space-y-1.5">
      {/* Action buttons */}
      <div className="flex items-center justify-start">
        <div className="flex items-center gap-1">
          <Button variant="outline" className="h-6 px-1.5 text-xs bg-transparent" onClick={handleOpenInChat}>
            <Sparkles className="size-3.5 mr-1" />
            Open in AI Chat
          </Button>
          <Button variant="outline" className="h-6 px-1.5 text-xs bg-transparent" asChild>
            <Link href={`/project/${projectId}/signals/${signalId}?traceId=${traceId}`}>
              <ExternalLink className="size-3.5 mr-1" />
              Open in Signals
            </Link>
          </Button>
        </div>
      </div>

      {/* Event payload */}
      {!latestEvent ? (
        <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">No events found</div>
      ) : (
        <>
          {validFields.map((field) => (
            <div key={field.name} className="rounded-md border bg-secondary/50 px-2 py-1.5">
              <div className="text-xs text-muted-foreground mb-0.5">{field.name}</div>
              <div className="text-sm">
                <PayloadValue value={parsed[field.name]} field={field} spanRefCallbacks={spanRefCallbacks} />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
