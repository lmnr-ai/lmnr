import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Button } from "@/components/ui/button.tsx";
import { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { TIME_SECONDS_FORMAT } from "@/lib/utils";

export type PatternRow = {
  id: string;
  clusterId: string;
  name: string;
  level: number;
  parentId: string | null;
  numChildrenClusters: number;
  numTraces: number;
  createdAt: string;
  updatedAt: string;
  subRows?: PatternRow[];
};

export const getColumns = (projectId: string): ColumnDef<PatternRow, any>[] => [
  {
    header: "",
    cell: ({ row }) =>
      row.original.numChildrenClusters > 0 ? (
        <Button
          icon={row.getIsExpanded() ? "chevronDown" : "chevronRight"}
          variant="ghost"
          className="p-0 h-5 text-secondary-foreground focus-visible:outline-0"
          onClick={() => row.toggleExpanded()}
        />
      ) : (
        <div className="min-w-5 min-h-5" />
      ),
    id: "expand",
    size: 44,
  },
  {
    accessorFn: (row) => row.name,
    header: "Pattern",
    id: "name",
    cell: ({ row }) => {
      const depth = row.depth; // Use actual nesting depth in the table
      const paddingLeft = depth * 24; // 24px per depth level

      // Create filter URL for traces page with 28 days (672 hours) time range
      const filter = JSON.stringify({
        column: "pattern",
        operator: "eq",
        value: row.original.name,
      });
      const tracesUrl = `/project/${projectId}/traces?filter=${encodeURIComponent(filter)}&pastHours=672`;

      return (
        <div style={{ paddingLeft: `${paddingLeft}px` }} className="truncate text-primary">
          <Link href={tracesUrl} onClick={(e) => e.stopPropagation()} target="_blank">
            {row.original.name}
          </Link>
        </div>
      );
    },
    size: 350,
  },
  {
    accessorFn: (row) => row.numChildrenClusters,
    header: "Sub patterns",
    id: "children_clusters",
    size: 120,
  },
  {
    accessorFn: (row) => row.numTraces,
    header: "Traces",
    id: "traces",
    size: 100,
  },
  {
    accessorFn: (row) => row.createdAt,
    header: "Created",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} format={TIME_SECONDS_FORMAT} />,
    id: "created_at",
    size: 150,
  },
  {
    accessorFn: (row) => row.updatedAt,
    header: "Updated",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} format={TIME_SECONDS_FORMAT} />,
    id: "updated_at",
    size: 150,
  },
];

export const defaultPatternsColumnOrder = ["expand", "name", "children_clusters", "traces", "created_at", "updated_at"];

export const patternsTableFilters: ColumnFilter[] = [
  {
    name: "Pattern",
    key: "name",
    dataType: "string",
  },
  {
    name: "Children patterns",
    key: "numChildrenPatterns",
    dataType: "number",
  },
  {
    name: "Traces",
    key: "numTraces",
    dataType: "number",
  },
];
