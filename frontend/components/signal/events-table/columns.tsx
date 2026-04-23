import { type ColumnDef } from "@tanstack/react-table";
import { Check, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { type SchemaField, type SchemaFieldType } from "@/components/signals/utils";
import { Badge } from "@/components/ui/badge";
import CopyTooltip from "@/components/ui/copy-tooltip";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import Mono from "@/components/ui/mono.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SEVERITY_LABELS } from "@/lib/actions/alerts/types";
import { type EventRow } from "@/lib/events/types.ts";
import { cn } from "@/lib/utils";

function PayloadFieldHeader({ name, description }: { name: string; description: string }) {
  if (!description) {
    return <span>{name}</span>;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default">{name}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[250px]">
          <p>{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function EnumCell({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      {value}
    </span>
  );
}

function BooleanCell({ value }: { value: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {value ? <Check className="size-4 text-green-500" /> : <X className="size-4 text-muted-foreground" />}
      <span className="text-secondary-foreground">{value ? "true" : "false"}</span>
    </span>
  );
}

function getColumnSize(type: SchemaFieldType): number {
  switch (type) {
    case "boolean":
      return 80;
    case "number":
      return 120;
    case "enum":
      return 160;
    case "string":
      return 400;
  }
}

function parsePayloadField(payload: string, fieldName: string): unknown {
  try {
    const parsed = JSON.parse(payload);
    return parsed[fieldName];
  } catch {
    return null;
  }
}

/**
 * Matches markdown links pointing at lmnr.ai / laminar.sh trace views, e.g.
 *   [Label](https://lmnr.ai/project/<pid>/traces/<traceId>?spanId=<uuid>&chat=true)
 *   [Label](https://www.laminar.sh/project/<pid>/traces/<traceId>?spanId=<uuid>)
 */
const LMNR_TRACE_LINK_REGEX =
  /\[([^\]]+)\]\(https?:\/\/(?:www\.)?(?:lmnr\.ai|laminar\.sh)\/project\/[0-9a-f-]+\/traces\/([0-9a-f-]+)(?:\?[^)]*?spanId=([0-9a-f-]+))?[^)]*\)/gi;

function SpanLink({ label, traceId, spanId }: { label: string; traceId: string; spanId?: string }) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const { setTraceId, setSpanId } = useSignalStoreContext((state) => ({
    setTraceId: state.setTraceId,
    setSpanId: state.setSpanId,
  }));

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setTraceId(traceId);
    setSpanId(spanId ?? null);

    const params = new URLSearchParams(searchParams.toString());
    params.set("traceId", traceId);
    if (spanId) {
      params.set("spanId", spanId);
    } else {
      params.delete("spanId");
    }
    router.replace(`${pathName}?${params.toString()}`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {label}
    </button>
  );
}

function renderPayloadText(text: string): React.ReactNode {
  LMNR_TRACE_LINK_REGEX.lastIndex = 0;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = LMNR_TRACE_LINK_REGEX.exec(text)) !== null) {
    const [fullMatch, label, traceId, spanId] = match;
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(<SpanLink key={`span-link-${key++}`} label={label} traceId={traceId} spanId={spanId} />);

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 0) {
    return text;
  }

  return <>{parts}</>;
}

function createPayloadColumnDef(field: SchemaField): ColumnDef<EventRow> {
  const columnId = `payload:${field.name}`;

  return {
    id: columnId,
    accessorFn: (row) => parsePayloadField(row.payload, field.name),
    header: () => <PayloadFieldHeader name={field.name} description={field.description} />,
    size: getColumnSize(field.type),
    cell: ({ getValue }) => {
      const value = getValue();
      if (value === null || value === undefined) {
        return <span className="text-muted-foreground">—</span>;
      }

      switch (field.type) {
        case "boolean":
          return <BooleanCell value={Boolean(value)} />;
        case "enum":
          return <EnumCell value={String(value)} />;
        case "number":
          return <span className="tabular-nums">{String(value)}</span>;
        case "string":
          return (
            <span className="line-clamp-3 whitespace-normal break-words text-secondary-foreground">
              {renderPayloadText(String(value))}
            </span>
          );
      }
    },
  };
}

function createPayloadFilter(field: SchemaField): ColumnFilter {
  switch (field.type) {
    case "number":
      return {
        name: field.name,
        key: `payload.${field.name}`,
        dataType: "number",
      };
    case "boolean":
      return {
        name: field.name,
        key: `payload.${field.name}`,
        dataType: "boolean",
      };
    case "enum":
      return {
        name: field.name,
        key: `payload.${field.name}`,
        dataType: "string",
      };
    default:
      return {
        name: field.name,
        key: `payload.${field.name}`,
        dataType: "string",
      };
  }
}

const SEVERITY_STYLES: Record<number, string> = {
  0: "rounded-3xl mr-1 text-muted-foreground/60",
  1: "rounded-3xl mr-1 text-orange-400/80",
  2: "rounded-3xl mr-1 text-red-400/100",
};

function SeverityCell({ value }: { value: number }) {
  const className = SEVERITY_STYLES[value] ?? SEVERITY_STYLES[0];
  const label = SEVERITY_LABELS[value as keyof typeof SEVERITY_LABELS] ?? "Info";
  return (
    <Badge variant="outline" className={cn("rounded-full font-medium", className)}>
      {label}
    </Badge>
  );
}

const staticColumnsBeforePayload: ColumnDef<EventRow>[] = [
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    size: 140,
    id: "timestamp",
  },
  {
    accessorKey: "severity",
    header: "Severity",
    cell: (row) => <SeverityCell value={Number(row.getValue())} />,
    size: 120,
    id: "severity",
  },
];

const staticColumnsAfterPayload: ColumnDef<EventRow>[] = [
  {
    accessorKey: "id",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "ID",
    size: 100,
    id: "id",
  },
  {
    accessorKey: "traceId",
    header: "Trace ID",
    cell: (row) => {
      const traceId = String(row.getValue());
      return (
        <div className="flex items-center min-w-0">
          <CopyTooltip value={traceId} delayDuration={300} className="min-w-0 truncate">
            <span className="font-mono text-xs truncate" dir="rtl">
              {traceId}
            </span>
          </CopyTooltip>
        </div>
      );
    },
    size: 180,
    id: "traceId",
  },
];

const staticFilters: ColumnFilter[] = [
  {
    name: "ID",
    key: "id",
    dataType: "string",
  },
  {
    name: "Trace ID",
    key: "trace_id",
    dataType: "string",
  },
  {
    name: "Run ID",
    key: "run_id",
    dataType: "string",
  },
  {
    name: "Severity",
    key: "severity",
    dataType: "enum",
    options: [
      { value: "0", label: "Info" },
      { value: "1", label: "Warning" },
      { value: "2", label: "Critical" },
    ],
  },
];

export function buildEventsColumns(schemaFields: SchemaField[]): {
  columns: ColumnDef<EventRow>[];
  columnOrder: string[];
  filters: ColumnFilter[];
} {
  const validFields = schemaFields.filter((f) => f.name.trim());
  const payloadColumns = validFields.map(createPayloadColumnDef);
  const payloadFilters = validFields.map(createPayloadFilter);

  const columns = [...staticColumnsBeforePayload, ...payloadColumns, ...staticColumnsAfterPayload];

  const columnOrder = ["timestamp", "severity", ...validFields.map((f) => `payload:${f.name}`), "traceId", "id"];

  const filters = [...staticFilters, ...payloadFilters];

  return { columns, columnOrder, filters };
}
