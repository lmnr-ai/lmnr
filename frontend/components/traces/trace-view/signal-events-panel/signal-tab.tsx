"use client";

import { Check, ExternalLink, MessageSquare, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { jsonSchemaToSchemaFields, type SchemaField } from "@/components/signals/utils";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { type EventRow } from "@/lib/events/types";

interface SignalTabProps {
  signalId: string;
  signalName: string;
  prompt: string;
  structuredOutput: Record<string, unknown>;
  events: EventRow[];
}

function parsePayload(payload: string): Record<string, unknown> {
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function PayloadValue({ value, field }: { value: unknown; field: SchemaField }) {
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
    case "string":
      return <span className="whitespace-pre-wrap break-words text-secondary-foreground">{String(value)}</span>;
  }
}

export default function SignalTab({ signalId, signalName, prompt, structuredOutput, events }: SignalTabProps) {
  const { projectId } = useParams();
  const openSignalInChat = useTraceViewStore((state) => state.openSignalInChat);

  const schemaFields = useMemo(() => jsonSchemaToSchemaFields(structuredOutput), [structuredOutput]);
  const validFields = useMemo(() => schemaFields.filter((f) => f.name.trim()), [schemaFields]);

  // Show the most recent event
  const safeEvents = events ?? [];
  const latestEvent = safeEvents[0];
  const parsed = useMemo(() => (latestEvent ? parsePayload(latestEvent.payload) : {}), [latestEvent]);

  const handleOpenInChat = () => {
    const signalDefinition = `Signal: ${signalName}\n\nPrompt: ${prompt}\n\nSchema: ${JSON.stringify(structuredOutput, null, 2)}`;
    const eventPayload = latestEvent ? latestEvent.payload : "No events found";
    openSignalInChat(signalDefinition, eventPayload);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Action buttons */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleOpenInChat}>
          <MessageSquare className="size-3" />
          Open in AI Chat
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" asChild>
          <Link href={`/project/${projectId}/signals/${signalId}`}>
            <ExternalLink className="size-3" />
            Open in Signals
          </Link>
        </Button>
      </div>

      {/* Event payload */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!latestEvent ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No events found</div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-2">
              {safeEvents.length} event{safeEvents.length !== 1 ? "s" : ""} &middot; Latest:{" "}
              {new Date(latestEvent.timestamp).toLocaleString()}
            </div>
            {validFields.map((field) => (
              <div key={field.name} className="rounded-md border bg-secondary/50 px-3 py-2">
                <div className="text-xs text-muted-foreground mb-1">{field.name}</div>
                <div className="text-sm">
                  <PayloadValue value={parsed[field.name]} field={field} />
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
