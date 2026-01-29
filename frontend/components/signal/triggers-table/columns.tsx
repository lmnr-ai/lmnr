import { TooltipPortal } from "@radix-ui/react-tooltip";
import { type ColumnDef } from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { getColumnName, getOperatorLabel } from "@/components/signals/manage-trigger-dialog";
import type { SchemaField } from "@/components/signals/utils.ts";
import { Badge } from "@/components/ui/badge";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type Trigger } from "@/lib/actions/signal-triggers";

export type TriggerRow = Trigger;

const formatFilter = (filter: { column: string; operator: string; value: string | number }): string => {
  const columnName = getColumnName(filter.column);
  const operatorLabel = getOperatorLabel(filter.column, filter.operator);
  return `${columnName} ${operatorLabel} ${filter.value}`;
};

const getClusteringKeyWarning = (clusteringKey: string | null, fields: SchemaField[]): string | null => {
  if (!clusteringKey) return null;

  const field = fields.find((f) => f.name === clusteringKey);

  if (!field) {
    return `Field "${clusteringKey}" does not exist in the signal schema. This trigger may not work as expected.`;
  }

  if (field.type !== "string") {
    return `Field "${clusteringKey}" has type "${field.type}" but clustering keys must be strings. This trigger may not work as expected.`;
  }

  return null;
};

export const getTriggersTableColumns = (fields: SchemaField[]): ColumnDef<TriggerRow>[] => [
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
    accessorKey: "clusteringKey",
    header: "Clustering key",
    cell: ({ row }) => {
      const clusteringKey = row.original.clusteringKey;
      if (!clusteringKey) {
        return <span className="text-muted-foreground">-</span>;
      }

      const warning = getClusteringKeyWarning(clusteringKey, fields);

      return (
        <div className="flex items-center gap-1.5">
          <Mono className="relative">{clusteringKey}</Mono>
          {warning && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                </TooltipTrigger>
                <TooltipPortal>
                  <TooltipContent side="top">
                    <p>{warning}</p>
                  </TooltipContent>
                </TooltipPortal>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    },
    id: "clusteringKey",
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: (row) => (row.getValue() ? <ClientTimestampFormatter absolute timestamp={String(row.getValue())} /> : "-"),
    size: 140,
    id: "createdAt",
  },
];

export const defaultTriggersColumnOrder = ["filters", "clusteringKey", "createdAt"];

export const triggersFilters: ColumnFilter[] = [
  {
    name: "Trigger ID",
    key: "trigger_id",
    dataType: "string",
  },
];
