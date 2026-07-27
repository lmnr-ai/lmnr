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
import { type Row, type RowData, type Table as TanstackTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Table } from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";

import { useTableStore } from "../model/table-store.tsx";
import { type LoadMoreButtonProps } from "../model/types.ts";
import { InfiniteDatatableBody } from "./body.tsx";
import { DraggingTableHeadOverlay } from "./head.tsx";
import { InfiniteDatatableHeader } from "./header.tsx";

interface VirtualizedScrollProps<TData extends RowData> {
  table: TanstackTable<TData>;
  effectiveColumnOrder: string[];
  setColumnOrder: (order: string[]) => void;
  estimatedRowHeight: number;
  overscan: number;
  hasMore: boolean;
  isFetching: boolean;
  isLoading: boolean;
  fetchNextPage: () => void;
  onRowClick?: (row: Row<TData>) => void;
  onHoveredRowChange?: (row: Row<TData> | null) => void;
  focusedRowId?: string | null;
  emptyRow?: ReactNode;
  loadingRow?: ReactNode;
  getRowHref?: (row: Row<TData>) => string;
  getRowClassName?: (row: Row<TData>) => string;
  loadMoreButton?: boolean | ((props: LoadMoreButtonProps) => ReactNode);
  scrollContentClassName?: string;
}

export function VirtualizedScroll<TData extends RowData>({
  table,
  effectiveColumnOrder,
  setColumnOrder,
  estimatedRowHeight,
  overscan,
  hasMore,
  isFetching,
  isLoading,
  fetchNextPage,
  onRowClick,
  onHoveredRowChange,
  focusedRowId,
  emptyRow,
  loadingRow,
  getRowHref,
  getRowClassName,
  loadMoreButton,
  scrollContentClassName = "border rounded",
}: VirtualizedScrollProps<TData>) {
  const tableStore = useTableStore();
  const setDraggingColumnId = useStore(tableStore, (s) => s.setDraggingColumnId);
  const draggingColumnId = useStore(tableStore, (s) => s.draggingColumnId);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLTableRowElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const [headerTop, setHeaderTop] = useState(0);

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
    // Fixed-height rows (truncate + estimatedRowHeight) — skip measureElement
    // so scroll doesn't force a layout read per mounted row.
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const dndContextId = useId();

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {})
  );

  function handleDragStart(event: DragStartEvent) {
    setDraggingColumnId(event.active.id as string);
    if (headerRef.current) {
      const rect = headerRef.current.getBoundingClientRect();
      setHeaderTop(rect.top);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingColumnId(null);

    if (active && over && active.id !== over.id) {
      const oldIndex = effectiveColumnOrder.indexOf(active.id as string);
      const newIndex = effectiveColumnOrder.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        setColumnOrder(arrayMove(effectiveColumnOrder, oldIndex, newIndex) as string[]);
      }
    }
  }

  const draggingHeader = useMemo(() => {
    if (!draggingColumnId) return null;
    const header = table.getHeaderGroups()[0]?.headers.find((h) => h.column.id === draggingColumnId);
    return header ?? null;
  }, [draggingColumnId, table]);

  useEffect(() => {
    if (loadMoreButton) return;

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
  }, [fetchNextPage, hasMore, isFetching, isLoading, loadMoreButton]);

  const tableWidth = table.getHeaderGroups()[0]?.headers.reduce((acc, header) => acc + header.getSize(), 0) || "100%";

  return (
    <div
      ref={tableContainerRef}
      className={cn("flex relative overflow-auto styled-scrollbar bg-secondary", scrollContentClassName)}
    >
      <div className="size-full">
        <DndContext
          id={dndContextId}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <Table className="grid border-collapse border-spacing-0 rounded bg-secondary" style={{ width: tableWidth }}>
            <InfiniteDatatableHeader ref={headerRef} table={table as TanstackTable<RowData>} />
            <InfiniteDatatableBody
              table={table}
              rowVirtualizer={rowVirtualizer}
              virtualItems={virtualItems}
              isLoading={isLoading}
              isFetching={isFetching}
              hasMore={hasMore}
              onRowClick={onRowClick}
              onHoveredRowChange={onHoveredRowChange}
              focusedRowId={focusedRowId}
              loadMoreRef={loadMoreRef}
              emptyRow={emptyRow}
              loadingRow={loadingRow}
              getRowHref={getRowHref}
              getRowClassName={getRowClassName}
              loadMoreButton={loadMoreButton}
              fetchNextPage={fetchNextPage}
            />
          </Table>
          <DragOverlay
            dropAnimation={null}
            adjustScale={false}
            style={{
              top: `${headerTop}px`,
              position: "fixed",
              pointerEvents: "none",
            }}
          >
            <DraggingTableHeadOverlay header={draggingHeader} />
          </DragOverlay>
        </DndContext>

        {isFetching && !isLoading && !loadMoreButton && (
          <div className="flex justify-center p-2 bg-secondary">
            <Skeleton className="w-full h-8" />
          </div>
        )}
      </div>
    </div>
  );
}
