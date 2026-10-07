import { type Cell, flexRender, type RowData } from "@tanstack/react-table";
import { type CSSProperties, memo } from "react";

import { TableCell } from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";

interface InfiniteTableCellProps<TData extends RowData> {
  cell: Cell<TData, unknown>;
  // Primitive so the memo comparator sees selection changes; TanStack reuses the same Cell across renders.
  isSelected: boolean;
  // Layout primitives resolved by the parent: getSize()/getStart() read live state off a reused
  // Column, so the comparator can't see resize changes unless they arrive as primitives.
  size: number;
  start: number;
  isPinned: boolean;
  // Changes when columns or table `meta` change, forcing re-render of cells with out-of-row content.
  cellRenderToken: object;
}

function InfiniteTableCellInner<TData extends RowData>({ cell, size, start, isPinned }: InfiniteTableCellProps<TData>) {
  const style: CSSProperties = {
    position: isPinned ? "sticky" : "relative",
    left: isPinned ? start : undefined,
    width: size,
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
    prev.size === next.size &&
    prev.start === next.start &&
    prev.isPinned === next.isPinned &&
    prev.isSelected === next.isSelected &&
    prev.cellRenderToken === next.cellRenderToken
  );
}

export const InfiniteTableCell = memo(InfiniteTableCellInner, areCellPropsEqual) as typeof InfiniteTableCellInner;
