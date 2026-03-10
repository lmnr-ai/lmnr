"use client";

import { format } from "date-fns";
import { Check, X,X as XIcon } from "lucide-react";
import { useMemo } from "react";

import { type SchemaField } from "@/components/signals/utils";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import Mono from "@/components/ui/mono";
import { type EventRow } from "@/lib/events/types";

export type EventDetailStyle = "A" | "B" | "C";

interface EventDetailPanelProps {
  event: EventRow;
  schemaFields: SchemaField[];
  onClose: () => void;
  onOpenTrace: (traceId: string) => void;
  style: EventDetailStyle;
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
      return value ? (
        <Check className="size-4 text-green-500" />
      ) : (
        <XIcon className="size-4 text-muted-foreground" />
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

// Style A: Clean card-based layout with sections
function StyleA({ event, schemaFields, onClose, onOpenTrace }: Omit<EventDetailPanelProps, "style">) {
  const parsed = useMemo(() => parsePayload(event.payload), [event.payload]);
  const validFields = schemaFields.filter((f) => f.name.trim());

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-medium">Event Details</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Metadata section */}
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Info</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Timestamp</span>
              <span className="text-xs">{format(new Date(event.timestamp), "MMM d, yyyy h:mm:ss a")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Event ID</span>
              <CopyButton text={event.id} variant="ghost" size="icon" className="h-5">
                <Mono className="text-xs">{event.id.slice(0, 8)}</Mono>
              </CopyButton>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Trace</span>
              <Button variant="ghost" size="sm" className="h-5 text-xs" onClick={() => onOpenTrace(event.traceId)}>
                <Mono>{event.traceId.slice(0, 8)}</Mono>
              </Button>
            </div>
          </div>
        </div>

        {/* Payload fields */}
        <div className="px-4 py-3">
          <div className="mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payload</span>
          </div>
          <div className="space-y-3">
            {validFields.map((field) => (
              <div key={field.name}>
                <div className="text-xs text-muted-foreground mb-1">{field.name}</div>
                <div className="text-sm">
                  <PayloadValue value={parsed[field.name]} field={field} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Style B: Two-column key-value grid, more compact
function StyleB({ event, schemaFields, onClose, onOpenTrace }: Omit<EventDetailPanelProps, "style">) {
  const parsed = useMemo(() => parsePayload(event.payload), [event.payload]);
  const validFields = schemaFields.filter((f) => f.name.trim());

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-medium">Event Details</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b">
              <td className="py-2 pr-4 text-muted-foreground text-xs font-medium align-top whitespace-nowrap">
                Timestamp
              </td>
              <td className="py-2 text-xs">{format(new Date(event.timestamp), "MMM d, yyyy h:mm:ss a")}</td>
            </tr>
            <tr className="border-b">
              <td className="py-2 pr-4 text-muted-foreground text-xs font-medium align-top whitespace-nowrap">
                Event ID
              </td>
              <td className="py-2">
                <CopyButton text={event.id} variant="ghost" size="icon" className="h-5">
                  <Mono className="text-xs">{event.id.slice(0, 8)}</Mono>
                </CopyButton>
              </td>
            </tr>
            <tr className="border-b">
              <td className="py-2 pr-4 text-muted-foreground text-xs font-medium align-top whitespace-nowrap">Trace</td>
              <td className="py-2">
                <Button variant="ghost" size="sm" className="h-5 text-xs" onClick={() => onOpenTrace(event.traceId)}>
                  <Mono>{event.traceId.slice(0, 8)}</Mono>
                </Button>
              </td>
            </tr>
            {validFields.map((field) => (
              <tr key={field.name} className="border-b last:border-b-0">
                <td className="py-2 pr-4 text-muted-foreground text-xs font-medium align-top whitespace-nowrap">
                  {field.name}
                </td>
                <td className="py-2 text-sm">
                  <PayloadValue value={parsed[field.name]} field={field} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Style C: Stacked cards per field with subtle backgrounds
function StyleC({ event, schemaFields, onClose, onOpenTrace }: Omit<EventDetailPanelProps, "style">) {
  const parsed = useMemo(() => parsePayload(event.payload), [event.payload]);
  const validFields = schemaFields.filter((f) => f.name.trim());

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{format(new Date(event.timestamp), "MMM d, h:mm:ss a")}</span>
          <span className="text-border">|</span>
          <CopyButton text={event.id} variant="ghost" size="icon" className="h-5">
            <Mono className="text-xs">{event.id.slice(0, 8)}</Mono>
          </CopyButton>
          <span className="text-border">|</span>
          <Button variant="ghost" size="sm" className="h-5 text-xs" onClick={() => onOpenTrace(event.traceId)}>
            View trace
          </Button>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-4" />
        </Button>
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

export default function EventDetailPanel(props: EventDetailPanelProps) {
  switch (props.style) {
    case "A":
      return <StyleA {...props} />;
    case "B":
      return <StyleB {...props} />;
    case "C":
      return <StyleC {...props} />;
  }
}
