import { type Cell, flexRender, type RowData } from "@tanstack/react-table";
import { type CSSProperties, memo } from "react";

import { TableCell } from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";

interface InfiniteTableCellProps<TData extends RowData> {
  cell: Cell<TData, unknown>;
}

/**
 * Body cells intentionally do NOT use `@dnd-kit/sortable`.
 * Column drag lives on the header only — registering useSortable per visible
 * cell (rows × columns) dominated scroll FPS in virtualized tables.
 */
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
        // Opaque baseline + row-state overlays (named `group/row` on TableRow)
        // so the pinned cell reads correctly as OTHER columns scroll underneath it.
        isPinned &&
          "bg-secondary border-r shadow-[2px_0_6px_-2px_rgba(0,0,0,0.35)] group-hover/row:bg-muted/50 group-data-[state=selected]/row:bg-primary/15 group-data-[focused=true]/row:bg-muted"
      )}
      style={style}
    >
      <div className="truncate flex-1 min-w-0">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
    </TableCell>
  );
}

export const InfiniteTableCell = memo(InfiniteTableCellInner) as typeof InfiniteTableCellInner;
