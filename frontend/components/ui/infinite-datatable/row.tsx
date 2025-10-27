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
        "min-w-full group/row",
        virtualRow.index < rowVirtualizer.options.count - 1 && "border-b",
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
        height: `${virtualRow.size}px`,
        transform: `translateY(${virtualRow.start - virtualRow.index * virtualRow.size}px)`,
      }}
    >
      {row.getVisibleCells().map((cell, index) => (
        <TableCell
          className="relative px-4 m-0 truncate my-auto"
          key={cell.id}
          style={{
            width: cell.column.getSize(),
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
