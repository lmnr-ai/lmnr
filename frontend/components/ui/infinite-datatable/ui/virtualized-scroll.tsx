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
import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  /** When set, this element scrolls instead of the table's own viewport. */
  externalScrollElement?: HTMLElement | null;
}

interface VirtualizedRowsProps<TData extends RowData> {
  table: TanstackTable<TData>;
  // Scroll element as state so the child virtualizer re-measures once it mounts.
  // Typed as HTMLElement, not HTMLDivElement: with `externalScrollElement` this is
  // an ancestor the table doesn't own and can't assume the tag of.
  scrollElement: HTMLElement | null;
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
  /** Pixels of content sitting above the rows inside the scroll element. */
  scrollMargin: number;
}

function VirtualizedRows<TData extends RowData>({
  table,
  scrollElement,
  scrollMargin,
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
}: VirtualizedRowsProps<TData>) {
  const loadMoreRef = useRef<HTMLTableRowElement>(null);
  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimatedRowHeight,
    overscan,
    // Under an external scroller the rows do not start at the top of the scroll
    // element — the whole top part is above them. Without this the virtualizer
    // reads a scroll offset that is too large by exactly that much and renders
    // the wrong slice of rows.
    scrollMargin,
    measureElement:
      typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
  });

  // `scrollMargin` is baked into each item's `start`, but rows are positioned by
  // `translateY` inside the table, whose own origin is already past the margin.
  // Take it back off so the two coordinate spaces agree.
  const virtualItems = useMemo(
    () => rowVirtualizer.getVirtualItems().map((item) => ({ ...item, start: item.start - scrollMargin })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowVirtualizer.getVirtualItems(), scrollMargin]
  );

  useEffect(() => {
    if (loadMoreButton) return;

    const loadMoreElement = loadMoreRef.current;

    if (!loadMoreElement || !scrollElement) return;
    if (!hasMore || isFetching || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isFetching) {
          fetchNextPage();
        }
      },
      {
        root: scrollElement,
        rootMargin: "420px",
        threshold: 0,
      }
    );

    observer.observe(loadMoreElement);

    return () => {
      observer.disconnect();
    };
  }, [fetchNextPage, hasMore, isFetching, isLoading, loadMoreButton, scrollElement]);

  return (
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
  );
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
  externalScrollElement,
}: VirtualizedScrollProps<TData>) {
  const tableStore = useTableStore();
  const setDraggingColumnId = useStore(tableStore, (s) => s.setDraggingColumnId);
  const draggingColumnId = useStore(tableStore, (s) => s.draggingColumnId);

  // State (via callback ref) rather than a plain ref: the virtualizer lives in a
  // child, and a ref populated after the child's layout effect leaves getVirtualItems
  // empty until an unrelated re-render. State forces the child to re-measure on mount.
  const [ownScrollElement, setOwnScrollElement] = useState<HTMLDivElement | null>(null);
  const scrollElement = externalScrollElement ?? ownScrollElement;
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const [headerTop, setHeaderTop] = useState(0);

  // How far the rows sit below the top of the scroll element. Zero when the table
  // owns its scrollport; under an external scroller it is whatever content sits
  // above the table, and it has to be re-measured because that content (filters,
  // charts) changes height as it loads.
  const [measuredScrollMargin, setMeasuredScrollMargin] = useState(0);
  // Derived rather than reset in the effect: without an external scroller the
  // margin is zero by definition, and a stale measurement must not leak through.
  const scrollMargin = externalScrollElement ? measuredScrollMargin : 0;
  useLayoutEffect(() => {
    if (!externalScrollElement || !ownScrollElement) return;
    const measure = () =>
      setMeasuredScrollMargin(
        ownScrollElement.getBoundingClientRect().top -
          externalScrollElement.getBoundingClientRect().top +
          externalScrollElement.scrollTop
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(externalScrollElement);
    observer.observe(ownScrollElement);
    // The content above the table is a sibling, so growing it moves the table
    // without resizing it — watch the shared parent to catch that.
    if (ownScrollElement.parentElement) observer.observe(ownScrollElement.parentElement);
    return () => observer.disconnect();
  }, [externalScrollElement, ownScrollElement]);

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

  const tableWidth = table.getHeaderGroups()[0]?.headers.reduce((acc, header) => acc + header.getSize(), 0) || "100%";

  return (
    <div
      ref={setOwnScrollElement}
      className={cn(
        "flex relative bg-secondary",
        // `overflow-auto` here is what makes the table its own scrollport. Under an
        // external scroller it has to stay visible, or the table clips itself at
        // whatever height it happens to have and the ancestor gets nothing to scroll.
        externalScrollElement ? "overflow-visible" : "overflow-auto styled-scrollbar",
        scrollContentClassName
      )}
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
            <VirtualizedRows
              table={table}
              scrollElement={scrollElement}
              scrollMargin={scrollMargin}
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
