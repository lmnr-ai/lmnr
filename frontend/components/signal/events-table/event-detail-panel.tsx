"use client";

import { Check, List, X } from "lucide-react";
import { useMemo } from "react";

import { type SchemaField } from "@/components/signals/utils";
import { Button } from "@/components/ui/button";
import { type EventRow } from "@/lib/events/types";

interface EventDetailPanelProps {
  event: EventRow;
  schemaFields: SchemaField[];
  onClose: () => void;
  onOpenTrace: (traceId: string) => void;
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
    return <span className="text-muted-foreground">—</span>;
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

export default function EventDetailPanel({ event, schemaFields, onClose, onOpenTrace }: EventDetailPanelProps) {
  const parsed = useMemo(() => parsePayload(event.payload), [event.payload]);
  const validFields = schemaFields.filter((f) => f.name.trim());

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col pl-4 pr-3 py-3 border-b">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-base font-medium">Event Payload</span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono rounded-md py-0.5 px-2 bg-muted">
            {new Date(event.timestamp).toLocaleString()}
          </span>
          <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => onOpenTrace(event.traceId)}>
            <List className="size-3" />
            View trace
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {validFields.map((field) => (
          <div key={field.name} className="rounded-md border bg-secondary/50 px-3 py-2">
            <div className="text-xs text-muted-foreground mb-1">{field.name}</div>
            <div className="text-sm">
              <PayloadValue value={parsed[field.name]} field={field} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
