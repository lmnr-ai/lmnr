"use client";

import { getCoreRowModel, getExpandedRowModel, RowData, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { PropsWithChildren, useEffect, useMemo, useRef } from "react";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Table } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { InfiniteDatatableBody } from "./body";
import { InfiniteDatatableHeader } from "./header";
import { SelectionPanel } from "./selection-panel";
import { InfiniteDataTableProps } from "./types";
import { createCheckboxColumn, EMPTY_ARRAY } from "./utils";

export function InfiniteDataTable<TData extends RowData>({
  // Infinite scroll props
  hasMore,
  isFetching,
  isLoading,
  fetchNextPage,
  estimatedRowHeight = 41,
  overscan = 100,

  // Custom interaction props
  onRowClick,
  focusedRowId,
  selectionPanel,

  // Styling
  className,
  childrenClassName,
  scrollContentClassName = "border rounded",
  emptyRow,
  loadingRow,
  children,

  // TableOptions props
  columns,
  data,
  state,
  enableRowSelection,
  onRowSelectionChange,
  getRowId,
  error,
  ...tableOptions
}: PropsWithChildren<InfiniteDataTableProps<TData>>) {
  const selectedRowIds = state?.rowSelection ? Object.keys(state.rowSelection) : [];
  const finalColumns = useMemo(
    () => (enableRowSelection ? [createCheckboxColumn<TData>(), ...columns] : columns),
    [columns, enableRowSelection]
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
      ...tableOptions.defaultColumn,
    },

    getSubRows: tableOptions.getSubRows ?? ((row: TData) => (row as any).subRows),
    enableExpanding: tableOptions.enableExpanding ?? true,
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: tableOptions.getRowCanExpand ?? (() => true),

    enableRowSelection,
    enableMultiRowSelection: tableOptions.enableMultiRowSelection ?? true,
    onRowSelectionChange,

    state: state,
  });

  const { rows } = table.getRowModel();

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLTableRowElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: overscan,
    measureElement:
      typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
  });

  useEffect(() => {
    const loadMoreElement = loadMoreRef.current;
    const scrollContainer = tableContainerRef.current;

    if (!loadMoreElement || !scrollContainer) return;
    if (!hasMore || isFetching || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      {
        root: scrollContainer,
        threshold: 0,
      }
    );

    observer.observe(loadMoreElement);

    return () => {
      observer.disconnect();
    };
  }, [fetchNextPage, hasMore, isFetching, isLoading]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  const handleClearSelection = () => {
    table.toggleAllRowsSelected(false);
  };

  return (
    <div className={cn("flex flex-col gap-2 relative overflow-hidden w-full", className)}>
      <SelectionPanel
        selectedRowIds={selectedRowIds}
        onClearSelection={handleClearSelection}
        selectionPanel={selectionPanel}
      />

      {children && <div className={cn("flex items-center space-x-2 h-12", childrenClassName)}>{children}</div>}
      <ScrollArea ref={tableContainerRef} className={cn("flex max-h-full relative", scrollContentClassName)}>
        <Table
          className="border-separate border-spacing-0 rounded bg-sidebar"
          style={{
            width: table.getHeaderGroups()[0]?.headers.reduce((acc, header) => acc + header.getSize(), 0) || "100%",
          }}
        >
          <InfiniteDatatableHeader table={table} />
          <InfiniteDatatableBody
            table={table}
            rowVirtualizer={rowVirtualizer}
            virtualItems={virtualItems}
            isLoading={isLoading}
            hasMore={hasMore}
            onRowClick={onRowClick}
            focusedRowId={focusedRowId}
            loadMoreRef={loadMoreRef}
            emptyRow={emptyRow}
            loadingRow={loadingRow}
            error={error}
          />
        </Table>

        {isFetching && !isLoading && (
          <div className="flex justify-center p-2 bg-sidebar">
            <Skeleton className="w-full h-8" />
          </div>
        )}
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
