import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { RowData } from "@tanstack/react-table";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { InfiniteDataTableRowProps } from "../types";
import { InfiniteTableCell } from "./cell";

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
        transform: `translateY(${virtualRow.start}px)`,
        width: "100%",
      }}
    >
      {row.getIsSelected() && <div className="border-l-2 border-l-primary absolute h-full left-0 top-0 z-10" />}
      <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
        {row.getVisibleCells().map((cell) => (
          <InfiniteTableCell key={cell.id} cell={cell} />
        ))}
      </SortableContext>
    </TableRow>
  );
}
