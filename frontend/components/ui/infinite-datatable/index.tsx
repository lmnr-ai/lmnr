"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { arrayMove } from "@dnd-kit/sortable";
import { flexRender, getCoreRowModel, getExpandedRowModel, RowData, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Table } from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";

import { useDataTableStore } from "./model/datatable-store.tsx";
import { InfiniteDataTableProps } from "./types.ts";
import { InfiniteDatatableBody } from "./ui/body.tsx";
import { InfiniteDatatableHeader } from "./ui/header.tsx";
import { SelectionPanel } from "./ui/selection-panel.tsx";
import { createCheckboxColumn, EMPTY_ARRAY } from "./utils.tsx";

export function InfiniteDataTable<TData extends RowData>({
  // Infinite scroll props
  hasMore,
  isFetching,
  isLoading,
  fetchNextPage,
  estimatedRowHeight = 41,
  overscan = 50,

  // Custom interaction props
  onRowClick,
  focusedRowId,
  selectionPanel,
  lockedColumns = EMPTY_ARRAY as string[],

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

  const store = useDataTableStore();
  const { columnOrder, setColumnOrder, columnVisibility, setColumnVisibility, draggingColumnId, setDraggingColumnId } =
    useStore(store, (state) => ({
      columnOrder: state.columnOrder,
      setColumnOrder: state.setColumnOrder,
      columnVisibility: state.columnVisibility,
      setColumnVisibility: state.setColumnVisibility,
      draggingColumnId: state.draggingColumnId,
      setDraggingColumnId: state.setDraggingColumnId,
    }));

  // Handle drag start
  function handleDragStart(event: DragStartEvent) {
    setDraggingColumnId(event.active.id as string);
    // Get header position for DragOverlay
    if (headerRef.current) {
      const rect = headerRef.current.getBoundingClientRect();
      setHeaderTop(rect.top);
    }
  }

  // reorder columns after drag & drop
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingColumnId(null);
    if (active && over && active.id !== over.id) {
      const oldIndex = columnOrder.indexOf(active.id as string);
      const newIndex = columnOrder.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        setColumnOrder(arrayMove(columnOrder, oldIndex, newIndex) as string[]);
      }
    }
  }

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before activating
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // 200ms delay for touch
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {})
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
    state: { ...state, columnVisibility, columnOrder },
    onColumnVisibilityChange: (visibility) => setColumnVisibility(visibility as Record<string, boolean>),
    onColumnOrderChange: (order) => setColumnOrder(order as string[]),
  });

  const { rows } = table.getRowModel();

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLTableRowElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const [headerTop, setHeaderTop] = useState<number>(0);

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

  const virtualItems = rowVirtualizer.getVirtualItems();

  const handleClearSelection = () => {
    table.toggleAllRowsSelected(false);
  };

  useEffect(() => {
    const loadMoreElement = loadMoreRef.current;
    const scrollContainer = tableContainerRef.current;

    if (!loadMoreElement || !scrollContainer) return;
    if (!hasMore || isFetching || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isFetching) {
          fetchNextPage();
        }
      },
      {
        root: scrollContainer,
        rootMargin: "420px",
        threshold: 0,
      }
    );

    observer.observe(loadMoreElement);

    return () => {
      observer.disconnect();
    };
  }, [fetchNextPage, hasMore, isFetching, isLoading]);
  return (
    <div className={cn("flex flex-col gap-2 relative overflow-hidden w-full", className)}>
      <SelectionPanel
        selectedRowIds={selectedRowIds}
        onClearSelection={handleClearSelection}
        selectionPanel={selectionPanel}
      />

      {children && <div className={cn("flex items-center space-x-2 h-12", childrenClassName)}>{children}</div>}
      <div
        ref={tableContainerRef}
        className={cn("flex relative overflow-auto styled-scrollbar bg-secondary", scrollContentClassName)}
      >
        <div className="size-full">
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToHorizontalAxis]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <Table
              className="grid border-collapse border-spacing-0 rounded bg-secondary"
              style={{
                width: table.getHeaderGroups()[0]?.headers.reduce((acc, header) => acc + header.getSize(), 0) || "100%",
              }}
            >
              <InfiniteDatatableHeader
                ref={headerRef}
                table={table as any}
                columnOrder={columnOrder}
                onHideColumn={(columnId) => {
                  setColumnVisibility({ ...columnVisibility, [columnId]: false });
                }}
                lockedColumns={lockedColumns}
              />
              <DragOverlay
                dropAnimation={null}
                adjustScale={false}
                style={{
                  top: `${headerTop}px`,
                  position: "fixed",
                  pointerEvents: "none",
                }}
              >
                {draggingColumnId
                  ? (() => {
                      const column = table.getColumn(draggingColumnId);
                      if (!column) return null;
                      const headerGroups = table.getHeaderGroups();
                      const header = headerGroups[0]?.headers.find((h) => h.column.id === draggingColumnId);
                      if (!header) return null;
                      return (
                        <div
                          className="bg-secondary border rounded-lg shadow-2xl opacity-95 rotate-2 scale-105"
                          style={{
                            width: column.getSize(),
                            height: 32,
                          }}
                        >
                          <div className="h-full flex items-center justify-between px-4 text-xs text-secondary-foreground truncate">
                            <div className="truncate">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  : null}
              </DragOverlay>
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
                columnOrder={columnOrder}
              />
            </Table>
          </DndContext>

          {isFetching && !isLoading && (
            <div className="flex justify-center p-2 bg-secondary">
              <Skeleton className="w-full h-8" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
