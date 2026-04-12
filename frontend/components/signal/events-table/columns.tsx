import { type ColumnDef } from "@tanstack/react-table";
import { Check, X } from "lucide-react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { type SchemaField, type SchemaFieldType } from "@/components/signals/utils";
import { Badge } from "@/components/ui/badge";
import CopyTooltip from "@/components/ui/copy-tooltip";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import Mono from "@/components/ui/mono.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

const SEVERITY_STYLES: Record<number, { label: string; className: string }> = {
  0: {
    label: "Info",
    className: "rounded-3xl mr-1 text-muted-foreground/60",
  },
  1: {
    label: "Warning",
    className: "rounded-3xl mr-1 text-orange-400/80",
  },
  2: {
    label: "Critical",
    className: "rounded-3xl mr-1 text-red-400/100",
  },
};

function SeverityCell({ value }: { value: number }) {
  const style = SEVERITY_STYLES[value] ?? SEVERITY_STYLES[0];
  return (
    <Badge variant="outline" className={cn("rounded-full font-medium", style.className)}>
      {style.label}
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
