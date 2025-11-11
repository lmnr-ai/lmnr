import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Cell, flexRender, RowData } from "@tanstack/react-table";
import { CSSProperties } from "react";

import { TableCell } from "@/components/ui/table";

interface InfiniteTableCellProps<TData extends RowData> {
  cell: Cell<TData, unknown>;
}

export function InfiniteTableCell<TData extends RowData>({ cell }: InfiniteTableCellProps<TData>) {
  const columnId = cell.column.id;
  const { isDragging, setNodeRef, transform } = useSortable({
    id: columnId || "",
    disabled: !columnId,
  });

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
    transform: CSS.Translate.toString(transform),
    transition: "width transform 0.2s ease-in-out",
    width: cell.column.getSize(),
    zIndex: isDragging ? 1 : 0,
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
