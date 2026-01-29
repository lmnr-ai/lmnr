import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type Cell, flexRender, type RowData } from "@tanstack/react-table";
import { type CSSProperties } from "react";
import { useStore } from "zustand";

import { TableCell } from "@/components/ui/table.tsx";

import { useDataTableStore } from "../model/datatable-store.tsx";

interface InfiniteTableCellProps<TData extends RowData> {
  cell: Cell<TData, unknown>;
}

export function InfiniteTableCell<TData extends RowData>({ cell }: InfiniteTableCellProps<TData>) {
  const columnId = cell.column.id;
  const store = useDataTableStore();
  const draggingColumnId = useStore(store, (state) => state.draggingColumnId);
  const { isDragging, setNodeRef, transform, transition } = useSortable({
    id: columnId || "",
    disabled: !columnId,
  });

  const isOtherDragging = draggingColumnId && draggingColumnId !== columnId;

  const style: CSSProperties = {
    opacity: isDragging ? 0.4 : isOtherDragging ? 0.9 : 1,
    position: "relative",
    transform: CSS.Translate.toString(transform),
    transition:
      transition ||
      (isOtherDragging
        ? "transform 0.3s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease-out"
        : "transform 0.2s ease-out, opacity 0.2s ease-out"),
    width: cell.column.getSize(),
    zIndex: isDragging ? 50 : isOtherDragging ? 1 : 0,
  };

  return (
    <TableCell
      className="relative px-4 m-0 truncate h-full my-auto"
      key={cell.id}
      style={{
        ...style,
        display: "flex",
      }}
      ref={setNodeRef}
    >
      <div className="truncate">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
    </TableCell>
  );
}
