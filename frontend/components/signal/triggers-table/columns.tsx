import { type ColumnDef } from "@tanstack/react-table";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { getColumnName, getOperatorLabel } from "@/components/signals/manage-trigger-dialog";
import { Badge } from "@/components/ui/badge";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type Trigger } from "@/lib/actions/signal-triggers";

export type TriggerRow = Trigger;

// Format a filter as a readable string
const formatFilter = (filter: { column: string; operator: string; value: string | number }): string => {
  const columnName = getColumnName(filter.column);
  const operatorLabel = getOperatorLabel(filter.column, filter.operator);
  return `${columnName} ${operatorLabel} ${filter.value}`;
};

export const triggersTableColumns: ColumnDef<TriggerRow>[] = [
  {
    accessorKey: "filters",
    header: "Filters",
    cell: ({ row }) => {
      const filters = row.original.filters;
      if (filters.length === 0) {
        return <span className="text-muted-foreground">No filters</span>;
      }
      return (
        <div className="flex flex-wrap gap-1.5">
          {filters.map((filter, index) => (
            <Badge key={index} variant="outline" className="text-xs text-secondary-foreground rounded-md">
              {formatFilter(filter)}
            </Badge>
          ))}
        </div>
      );
    },
    size: 500,
    id: "filters",
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: (row) => (row.getValue() ? <ClientTimestampFormatter timestamp={String(row.getValue())} /> : "-"),
    size: 140,
    id: "createdAt",
  },
];

export const defaultTriggersColumnOrder = ["filters", "createdAt"];

export const triggersFilters: ColumnFilter[] = [
  {
    name: "Trigger ID",
    key: "trigger_id",
    dataType: "string",
  },
];
