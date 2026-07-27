"use client";

import {
  getCoreRowModel,
  getExpandedRowModel,
  type RowData,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import React, { type PropsWithChildren, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { cn } from "@/lib/utils.ts";

import { computeEffectiveOrder, useTableConfigStore } from "./model/table-config-store.tsx";
import { type InfiniteDataTableProps } from "./model/types.ts";
import { SelectionPanel } from "./ui/selection-panel.tsx";
import { VirtualizedScroll } from "./ui/virtualized-scroll.tsx";
import { createCheckboxColumn, EMPTY_ARRAY } from "./utils.tsx";

export function InfiniteDataTable<TData extends RowData>({
  hasMore,
  isFetching,
  isLoading,
  fetchNextPage,
  estimatedRowHeight = 41,
  overscan = 5,

  onRowClick,
  onHoveredRowChange,
  focusedRowId,
  selectionPanel,
  pinnedColumns,
  pinnedLeftColumnIds,

  className,
  childrenClassName,
  scrollContentClassName = "border rounded",
  emptyRow,
  loadingRow,
  children,

  sortBy,
  sortDirection,
  onSort,

  columns,
  data,
  state,
  enableRowSelection,
  onRowSelectionChange,
  getRowId,
  error: _error,
  getRowHref,
  getRowClassName,
  loadMoreButton,
  hideSelectionPanel = false,
  ...tableOptions
}: PropsWithChildren<InfiniteDataTableProps<TData>>) {
  const selectedRowIds = state?.rowSelection ? Object.keys(state.rowSelection) : [];
  const finalColumns = useMemo(
    () => (enableRowSelection ? [createCheckboxColumn<TData>(), ...columns] : columns),
    [columns, enableRowSelection]
  );

  const sorting: SortingState = useMemo(
    () => (sortBy ? [{ id: sortBy, desc: sortDirection === "desc" }] : []),
    [sortBy, sortDirection]
  );

  const availableIds = useMemo(() => finalColumns.map((c) => c.id!).filter(Boolean), [finalColumns]);

  const { columnOrder, setColumnOrder, columnVisibility, setColumnVisibility, columnSizing, setColumnSizing } =
    useTableConfigStore(
      (state) => ({
        columnOrder: state.config.columnOrder,
        setColumnOrder: state.setColumnOrder,
        columnVisibility: state.config.columnVisibility,
        setColumnVisibility: state.setColumnVisibility,
        columnSizing: state.config.columnSizing,
        setColumnSizing: state.setColumnSizing,
      }),
      shallow
    );

  const orderPins = useMemo(
    () => [...(pinnedColumns ?? []), ...(pinnedLeftColumnIds ?? [])],
    [pinnedColumns, pinnedLeftColumnIds]
  );
  const effectiveColumnOrder = useMemo(
    () => computeEffectiveOrder(columnOrder, availableIds, orderPins.length ? orderPins : (EMPTY_ARRAY as string[])),
    [columnOrder, availableIds, orderPins]
  );

  const table = useReactTable<TData>({
    ...tableOptions,

    data: data || (EMPTY_ARRAY as TData[]),
    columns: finalColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,

    columnResizeMode: tableOptions.columnResizeMode ?? "onChange",
    columnResizeDirection: tableOptions.columnResizeDirection ?? "ltr",
    defaultColumn: {
      minSize: 32,
      enableSorting: false,
      ...tableOptions.defaultColumn,
    },

    getSubRows: tableOptions.getSubRows ?? ((row: TData) => (row as any).subRows),
    enableExpanding: tableOptions.enableExpanding ?? true,
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: tableOptions.getRowCanExpand ?? (() => true),

    manualSorting: true,
    enableSorting: true,
    onSortingChange: (updater) => {
      if (!onSort) return;
      const next = typeof updater === "function" ? updater(sorting) : updater;
      if (next.length > 0) {
        onSort(next[0].id, next[0].desc ? "desc" : "asc");
      } else {
        onSort("", "asc");
      }
    },

    enableRowSelection,
    enableMultiRowSelection: tableOptions.enableMultiRowSelection ?? true,
    onRowSelectionChange,
    enableColumnPinning: !!pinnedLeftColumnIds?.length,
    state: {
      ...state,
      columnVisibility,
      columnOrder: effectiveColumnOrder,
      columnSizing,
      sorting,
      columnPinning: { left: pinnedLeftColumnIds ?? [] },
    },
    onColumnSizingChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnSizing) : updater;
      setColumnSizing(next);
    },
    onColumnVisibilityChange: (visibility) => setColumnVisibility(visibility as Record<string, boolean>),
    onColumnOrderChange: (order) => setColumnOrder(order as string[]),
  });

  const handleClearSelection = () => {
    table.toggleAllRowsSelected(false);
  };

  return (
    <div className={cn("flex flex-col gap-2 relative overflow-hidden w-full", className)}>
      {!hideSelectionPanel && (
        <SelectionPanel
          selectedRowIds={selectedRowIds}
          onClearSelection={handleClearSelection}
          selectionPanel={selectionPanel}
        />
      )}
      {children && <div className={cn("flex flex-col gap-2 items-start", childrenClassName)}>{children}</div>}
      <VirtualizedScroll
        table={table}
        effectiveColumnOrder={effectiveColumnOrder}
        setColumnOrder={setColumnOrder}
        estimatedRowHeight={estimatedRowHeight}
        overscan={overscan}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        onRowClick={onRowClick}
        onHoveredRowChange={onHoveredRowChange}
        focusedRowId={focusedRowId}
        emptyRow={emptyRow}
        loadingRow={loadingRow}
        getRowHref={getRowHref}
        getRowClassName={getRowClassName}
        loadMoreButton={loadMoreButton}
        scrollContentClassName={scrollContentClassName}
      />
    </div>
  );
}
