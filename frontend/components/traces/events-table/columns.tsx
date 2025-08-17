import { ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";

// Define the Event type based on the database schema
export type EventsTableRow = {
  id: string;
  createdAt: string;
  timestamp: string;
  name: string;
  attributes: Record<string, any>;
  spanId: string;
  projectId: string;
};

export const filters: ColumnFilter[] = [
  {
    key: "id",
    name: "ID",
    dataType: "string",
  },
  {
    key: "name",
    name: "Name",
    dataType: "string",
  },
  {
    key: "span_id",
    name: "Span ID",
    dataType: "string",
  },
  {
    key: "attributes",
    name: "Attributes",
    dataType: "string",
  },
];

export const columns: ColumnDef<EventsTableRow, any>[] = [
  {
    cell: (row) => <Mono>{row.getValue()}</Mono>,
    header: "ID",
    accessorFn: (row) => row.id.replace(/^00000000-0000-0000-/g, ""),
    id: "id",
    size: 120,
  },
  {
    accessorKey: "name",
    header: "Name",
    id: "name",
    size: 200,
  },
  {
    cell: (row) => <Mono>{row.getValue()}</Mono>,
    accessorKey: "spanId",
    header: "Span ID",
    id: "span_id",
    accessorFn: (row) => row.spanId.replace(/^00000000-0000-0000-/g, ""),
    size: 120,
  },
  {
    accessorFn: (row) => row.timestamp,
    header: "Timestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "timestamp",
    size: 150,
  },
  {
    accessorKey: "attributes",
    header: "Attributes",
    id: "attributes",
    cell: (row) => {
      const attributes = row.getValue() as Record<string, any>;
      if (!attributes || Object.keys(attributes).length === 0) {
        return <span className="text-muted-foreground">-</span>;
      }

      // Display the attributes as a truncated JSON string
      const attributesText = JSON.stringify(attributes);
      const maxLength = 100;
      const truncated =
        attributesText.length > maxLength ? attributesText.substring(0, maxLength) + "..." : attributesText;

      return (
        <div className="font-mono text-xs" title={attributesText}>
          {truncated}
        </div>
      );
    },
    size: 300,
  },
  {
    accessorFn: (row) => row.createdAt,
    header: "Created At",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "created_at",
    size: 150,
  },
];
