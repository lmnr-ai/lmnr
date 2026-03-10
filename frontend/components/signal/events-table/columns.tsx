import { type ColumnDef } from "@tanstack/react-table";
import { Check, SquareArrowOutUpRight, X } from "lucide-react";
import { type MouseEvent } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { type SchemaField, type SchemaFieldType } from "@/components/signals/utils";
import CopyTooltip from "@/components/ui/copy-tooltip";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import Mono from "@/components/ui/mono.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type EventRow } from "@/lib/events/types.ts";

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
              {String(value)}
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

const staticColumnsBeforePayload: ColumnDef<EventRow>[] = [
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    size: 140,
    id: "timestamp",
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
        <div className="flex items-center gap-1">
          <CopyTooltip value={traceId}>
            <Mono className="truncate">{traceId.slice(0, 8)}</Mono>
          </CopyTooltip>
          <button
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              const event = new CustomEvent("open-trace", { detail: traceId });
              window.dispatchEvent(event);
            }}
            title="View trace"
          >
            <SquareArrowOutUpRight className="size-3" />
          </button>
        </div>
      );
    },
    size: 120,
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

  const columnOrder = ["timestamp", ...validFields.map((f) => `payload:${f.name}`), "id", "traceId"];

  const filters = [...staticFilters, ...payloadFilters];

  return { columns, columnOrder, filters };
}
