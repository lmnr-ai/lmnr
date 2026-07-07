import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type Cell, flexRender, type RowData } from "@tanstack/react-table";
import { type CSSProperties } from "react";
import { useStore } from "zustand";

import { TableCell } from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";

import { useTableStore } from "../model/table-store.tsx";

interface InfiniteTableCellProps<TData extends RowData> {
  cell: Cell<TData, unknown>;
}

export function InfiniteTableCell<TData extends RowData>({ cell }: InfiniteTableCellProps<TData>) {
  const columnId = cell.column.id;
  const store = useTableStore();
  const draggingColumnId = useStore(store, (state) => state.draggingColumnId);
  const { isDragging, setNodeRef, transform, transition } = useSortable({
    id: columnId || "",
    disabled: !columnId,
  });

  const isOtherDragging = draggingColumnId && draggingColumnId !== columnId;
  const isPinned = cell.column.getIsPinned() === "left";

  const style: CSSProperties = {
    opacity: isDragging ? 0.4 : isOtherDragging ? 0.9 : 1,
    position: isPinned ? "sticky" : "relative",
    left: isPinned ? cell.column.getStart("left") : undefined,
    transform: CSS.Translate.toString(transform),
    transition:
      transition ||
      (isOtherDragging
        ? "transform 0.3s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease-out"
        : "transform 0.2s ease-out, opacity 0.2s ease-out"),
    width: cell.column.getSize(),
    zIndex: isDragging ? 50 : isOtherDragging ? 1 : isPinned ? 10 : 0,
  };

  return (
    <TableCell
      className={cn(
        "relative px-4 m-0 truncate h-full my-auto",
        // Opaque baseline + row-state overlays (named `group/row` on TableRow)
        // so the pinned cell reads correctly as OTHER columns scroll underneath it.
        isPinned &&
          "bg-secondary border-r shadow-[2px_0_6px_-2px_rgba(0,0,0,0.35)] group-hover/row:bg-muted/50 group-data-[state=selected]/row:bg-primary/15 group-data-[focused=true]/row:bg-muted"
      )}
      key={cell.id}
      style={{
        ...style,
        display: "flex",
      }}
      ref={setNodeRef}
    >
      <div className="truncate flex-1 min-w-0">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
    </TableCell>
  );
}
