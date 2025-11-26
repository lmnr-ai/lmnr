import { RowData } from "@tanstack/react-table";

import { TableRow } from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";

import { InfiniteDataTableRowProps } from "../model/types.ts";
import { InfiniteTableCell } from "./cell.tsx";

export function InfiniteDatatableRow<TData extends RowData>({
  virtualRow,
  row,
  rowVirtualizer,
  onRowClick,
  focusedRowId,
  columnOrder,
}: InfiniteDataTableRowProps<TData>) {
  return (
    <TableRow
      data-index={virtualRow.index}
      ref={(node) => rowVirtualizer.measureElement(node)}
      className={cn(
        "flex min-w-full border-b last:border-b-0 group/row relative",
        !!onRowClick && "cursor-pointer",
        row.depth > 0 && "bg-secondary/40",
        focusedRowId === row.id && "bg-muted"
      )}
      key={row.id}
      data-state={row.getIsSelected() && "selected"}
      onClick={() => {
        onRowClick?.(row);
      }}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${virtualRow.start}px)`,
        willChange: "transform",
      }}
    >
      {row.getIsSelected() && <div className="border-l-2 border-l-primary absolute h-full left-0 top-0 z-10" />}
      {row.getVisibleCells().map((cell) => (
        <InfiniteTableCell key={cell.id} cell={cell} />
      ))}
    </TableRow>
  );
}
