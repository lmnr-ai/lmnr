"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { jsonSchemaToSchemaFields, type SchemaField } from "@/components/signals/utils";
import { renderSpanReferences, type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { type EventRow } from "@/lib/events/types";

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
      return <span className="text-secondary-foreground">{value ? "true" : "false"}</span>;
    case "enum":
      return (
        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {String(value)}
        </span>
      );
    case "number":
      return <span className="tabular-nums text-secondary-foreground">{String(value)}</span>;
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

export default function ExpandedContent({ traceId, signal }: Props) {
  const { projectId } = useParams();
  const openSignalInChat = useTraceViewStore((state) => state.openSignalInChat);
  const selectSpanById = useTraceViewStore((state) => state.selectSpanById);

  const events = (signal.events as EventRow[]) ?? [];
  const latestEvent = events[0];
  const leafCluster = signal.clusterPath[signal.clusterPath.length - 1];

  const schemaFields = useMemo(
    () => jsonSchemaToSchemaFields(schemaFieldsToStructuredOutput(signal.schemaFields)),
    [signal.schemaFields]
  );
  const validFields = useMemo(() => schemaFields.filter((f) => f.name.trim()), [schemaFields]);
  const parsed = useMemo(() => (latestEvent ? parsePayload(latestEvent.payload) : {}), [latestEvent]);

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
    () => ({ resolveSpanId, onSelectSpan: selectSpanById }),
    [resolveSpanId, selectSpanById]
  );

  const handleOpenInChat = () => {
    const signalDefinition = `### ${signal.signalName}\n${signal.prompt}`;
    const eventPayload = latestEvent ? latestEvent.payload : "No events found";
    openSignalInChat(signalDefinition, eventPayload);
  };

  const buttonClass = "h-6 px-1.5 text-xs bg-transparent border-border hover:bg-muted text-secondary-foreground";

  return (
    <div className="px-4 pt-2 pb-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="outline" className={buttonClass} onClick={handleOpenInChat}>
          <Sparkles className="size-3.5 mr-1" />
          Open in AI Chat
        </Button>
        <Button variant="outline" className={buttonClass} asChild>
          <Link href={`/project/${projectId}/signals/${signal.signalId}`} target="_blank">
            <ExternalLink className="size-3.5 mr-1" />
            Open in Signals
          </Link>
        </Button>
        {leafCluster && (
          <Button variant="outline" className={buttonClass} asChild>
            <Link href={`/project/${projectId}/signals/${signal.signalId}?clusterId=${leafCluster.id}`} target="_blank">
              <ExternalLink className="size-3.5 mr-1" />
              Open cluster
            </Link>
          </Button>
        )}
      </div>
      {!latestEvent ? (
        <div className="py-2 text-xs text-muted-foreground">No events found</div>
      ) : (
        validFields.map((field) => (
          <div key={field.name}>
            <div className="text-xs text-muted-foreground mb-0.5">{field.name}</div>
            <div className="text-xs">
              <PayloadValue value={parsed[field.name]} field={field} spanRefCallbacks={spanRefCallbacks} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
