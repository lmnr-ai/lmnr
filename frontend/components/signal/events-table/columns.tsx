import { type ColumnDef } from "@tanstack/react-table";
import { Check, Copy, X } from "lucide-react";
import { type MouseEvent } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { laminarAgentStore } from "@/components/laminar-agent/store";
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

type BuildEventsColumnsOptions = {
  onTraceIdClick?: (traceId: string) => void;
  aiEnabled?: boolean;
};

function getStaticColumnsAfterPayload({
  onTraceIdClick,
  aiEnabled = false,
}: BuildEventsColumnsOptions): ColumnDef<EventRow>[] {
  return [
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
        const event = row.row.original;
        return (
          <div className="flex items-center gap-1 min-w-0">
            <button
              className="font-mono text-xs min-w-0 truncate"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                onTraceIdClick?.(traceId);

                if (!aiEnabled) {
                  return;
                }

                const agentState = laminarAgentStore.getState();
                agentState.setViewMode("floating");
                agentState.setPrefillInput(
                  `Show me the payload of this signal event ${event.id} formatted in a table, explain why it was detected on this trace ${traceId}, and detail which spans are relevant and why`
                );
              }}
            >
              {traceId}
            </button>
            <CopyTooltip value={traceId} className="">
              <Copy className="size-3" />
            </CopyTooltip>
          </div>
        );
      },
      size: 180,
      id: "traceId",
    },
  ];
}

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

export function buildEventsColumns(
  schemaFields: SchemaField[],
  options: BuildEventsColumnsOptions = {}
): {
  columns: ColumnDef<EventRow>[];
  columnOrder: string[];
  filters: ColumnFilter[];
} {
  const validFields = schemaFields.filter((f) => f.name.trim());
  const payloadColumns = validFields.map(createPayloadColumnDef);
  const payloadFilters = validFields.map(createPayloadFilter);

  const columns = [...staticColumnsBeforePayload, ...payloadColumns, ...getStaticColumnsAfterPayload(options)];

  const columnOrder = ["timestamp", "traceId", ...validFields.map((f) => `payload:${f.name}`), "id"];

  const filters = [...staticFilters, ...payloadFilters];

  return { columns, columnOrder, filters };
}
