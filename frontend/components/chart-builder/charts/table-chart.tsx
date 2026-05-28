import { type ColumnDef } from "@tanstack/react-table";
import { isEqual, isNil, isObject } from "lodash";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { type TableColumnConfig } from "@/components/chart-builder/types";
import { type ColumnInfo } from "@/components/chart-builder/utils";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { type TableConfig, useColumnConfig } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { formatRelativeTime } from "@/lib/utils";

// Forwards column-state changes from the store back to the caller. Lives here
// (a child of the provider) so the provider stays a pure state container —
// no useRef + subscribe plumbing inside the model layer.
const ColumnConfigEmitter = ({
  initial,
  onChange,
}: {
  initial: TableConfig;
  onChange: (config: TableConfig) => void;
}) => {
  const config = useColumnConfig();
  // Capture the seed once so the first emit is suppressed; otherwise the parent
  // would persist a no-op write on mount (problematic for the dashboard chart's
  // debounced PATCH to the backend).
  const [seed] = useState(() => initial);

  useEffect(() => {
    if (
      isEqual(config.columnOrder, seed.columnOrder) &&
      isEqual(config.columnSizing, seed.columnSizing) &&
      isEqual(config.columnVisibility, seed.columnVisibility)
    ) {
      return;
    }
    onChange(config);
  }, [config, onChange, seed]);

  return null;
};

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}[T ]/;

const PAGE_SIZE = 50;

interface TableChartProps {
  data: Record<string, any>[];
  columns: ColumnInfo[];
  hiddenColumns?: string[];
  onRowClick?: (rowData: Record<string, any>) => void;
  tableColumnConfig?: TableColumnConfig;
  onColumnConfigChange?: (config: TableColumnConfig) => void;
  hasMore?: boolean;
  isFetching?: boolean;
  fetchNextPage?: () => void;
}

const formatCell = (value: unknown): string => {
  if (isNil(value)) return "NULL";
  if (isObject(value)) {
    try {
      const serialized = JSON.stringify(value);
      return serialized.length > 200 ? `${serialized.slice(0, 200)}…` : serialized;
    } catch {
      return "[Object]";
    }
  }
  if (typeof value === "string" && ISO_DATE_REGEX.test(value)) {
    return formatRelativeTime(value);
  }
  return String(value);
};

const isRowClickable = (row: Record<string, any>): boolean => !!(row?.trace_id || row?.id);

const TableChart = ({
  data,
  columns: columnInfos,
  hiddenColumns,
  onRowClick,
  tableColumnConfig,
  onColumnConfigChange,
  hasMore = false,
  isFetching = false,
  fetchNextPage,
}: TableChartProps) => {
  const hiddenSet = useMemo(() => new Set(hiddenColumns ?? []), [hiddenColumns]);

  const visibleColumnNames = useMemo(() => {
    const all = columnInfos.length > 0 ? columnInfos.map((c) => c.name) : data[0] ? Object.keys(data[0]) : [];
    return all.filter((h) => !hiddenSet.has(h));
  }, [columnInfos, data, hiddenSet]);

  const tableColumns: ColumnDef<Record<string, any>>[] = useMemo(
    () =>
      visibleColumnNames.map((name) => ({
        id: name,
        accessorKey: name,
        header: name,
        enableResizing: true,
        size: 150,
        cell: ({ getValue }) => {
          const formatted = formatCell(getValue());
          return (
            <span className="whitespace-nowrap max-w-xs truncate block" title={formatted}>
              {formatted}
            </span>
          );
        },
      })),
    [visibleColumnNames]
  );

  const initialColumnConfig = useMemo((): TableConfig => {
    const savedOrder = tableColumnConfig?.columnOrder;
    const validOrder = savedOrder?.filter((col) => visibleColumnNames.includes(col)) ?? [];
    const newCols = visibleColumnNames.filter((col) => !validOrder.includes(col));
    const mergedOrder = [...validOrder, ...newCols];

    return {
      customColumns: [],
      columnOrder: mergedOrder.length > 0 ? mergedOrder : visibleColumnNames,
      columnSizing: tableColumnConfig?.columnSizing ?? {},
      columnVisibility: tableColumnConfig?.columnVisibility ?? {},
    };
  }, [tableColumnConfig, visibleColumnNames]);

  const handleColumnConfigChange = useCallback(
    (config: TableConfig) => {
      onColumnConfigChange?.({
        columnOrder: config.columnOrder,
        columnSizing: config.columnSizing,
        columnVisibility: config.columnVisibility,
      });
    },
    [onColumnConfigChange]
  );

  const handleRowClick = useCallback(
    (row: any) => {
      const original = row.original;
      if (onRowClick && isRowClickable(original)) {
        onRowClick(original);
      }
    },
    [onRowClick]
  );

  if (data.length === 0) {
    return (
      <div className="flex flex-1 h-full justify-center items-center bg-muted/30 rounded-lg w-full">
        <span className="text-muted-foreground">No data</span>
      </div>
    );
  }

  return (
    <div className="text-sm flex-1 min-h-0 w-full h-full">
      <InfiniteDataTableProvider defaults={initialColumnConfig} pageSize={PAGE_SIZE} disableHideColumn>
        {onColumnConfigChange && (
          <ColumnConfigEmitter initial={initialColumnConfig} onChange={handleColumnConfigChange} />
        )}
        <InfiniteDataTable
          columns={tableColumns}
          data={data}
          hasMore={hasMore}
          isFetching={isFetching}
          isLoading={false}
          fetchNextPage={fetchNextPage ?? (() => {})}
          onRowClick={onRowClick ? handleRowClick : undefined}
          className="h-full"
          scrollContentClassName="border rounded-md"
          hideSelectionPanel
          estimatedRowHeight={35}
        />
      </InfiniteDataTableProvider>
    </div>
  );
};

export default TableChart;
