import { flexRender, RowData } from "@tanstack/react-table";

import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { InfiniteDataTableRowProps } from "./types";

export function InfiniteDatatableRow<TData extends RowData>({
  virtualRow,
  row,
  rowVirtualizer,
  onRowClick,
  focusedRowId,
}: InfiniteDataTableRowProps<TData>) {
  return (
    <TableRow
      data-index={virtualRow.index}
      ref={(node) => rowVirtualizer.measureElement(node)}
      className={cn(
        "flex min-w-full border-b last:border-b-0 group/row absolute",
        !!onRowClick && "cursor-pointer",
        row.depth > 0 && "bg-secondary/40",
        focusedRowId === row.id && "bg-secondary/70"
      )}
      key={row.id}
      data-state={row.getIsSelected() && "selected"}
      onClick={() => {
        onRowClick?.(row);
      }}
      style={{
        transform: `translateY(${virtualRow.start}px)`,
        width: "100%",
      }}
    >
      {row.getVisibleCells().map((cell, index) => (
        <TableCell
          className="relative px-4 m-0 truncate h-full my-auto"
          key={cell.id}
          style={{
            width: cell.column.getSize(),
            display: "flex",
          }}
        >
          {row.getIsSelected() && index === 0 && (
            <div className="border-l-2 border-l-primary absolute h-full left-0 top-0" />
          )}
          <div className="truncate">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
        </TableCell>
      ))}
    </TableRow>
  );
}
