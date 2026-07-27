import { type Cell, flexRender, type RowData } from "@tanstack/react-table";
import { type CSSProperties, memo } from "react";

import { TableCell } from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";

interface InfiniteTableCellProps<TData extends RowData> {
  cell: Cell<TData, unknown>;
}

function InfiniteTableCellInner<TData extends RowData>({ cell }: InfiniteTableCellProps<TData>) {
  const isPinned = cell.column.getIsPinned() === "left";

  const style: CSSProperties = {
    position: isPinned ? "sticky" : "relative",
    left: isPinned ? cell.column.getStart("left") : undefined,
    width: cell.column.getSize(),
    zIndex: isPinned ? 10 : 0,
    display: "flex",
  };

  return (
    <TableCell
      className={cn(
        "relative px-4 m-0 truncate h-full my-auto",
        isPinned &&
          "bg-secondary border-r shadow-[2px_0_6px_-2px_rgba(0,0,0,0.35)] group-hover/row:bg-muted/50 group-data-[state=selected]/row:bg-primary/15 group-data-[focused=true]/row:bg-muted"
      )}
      style={style}
    >
      <div className="truncate flex-1 min-w-0">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
    </TableCell>
  );
}

function areCellPropsEqual<TData extends RowData>(
  prev: InfiniteTableCellProps<TData>,
  next: InfiniteTableCellProps<TData>
) {
  return (
    prev.cell.id === next.cell.id &&
    prev.cell.row.original === next.cell.row.original &&
    prev.cell.column.getSize() === next.cell.column.getSize() &&
    prev.cell.column.getIsPinned() === next.cell.column.getIsPinned() &&
    prev.cell.row.getIsSelected() === next.cell.row.getIsSelected()
  );
}

export const InfiniteTableCell = memo(InfiniteTableCellInner, areCellPropsEqual) as typeof InfiniteTableCellInner;
