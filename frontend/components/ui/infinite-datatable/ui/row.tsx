import { type RowData } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { type MouseEvent, useCallback } from "react";

import { TableRow } from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";

import { type InfiniteDataTableRowProps } from "../model/types.ts";
import { InfiniteTableCell } from "./cell.tsx";

export function InfiniteDatatableRow<TData extends RowData>({
  virtualRow,
  row,
  rowVirtualizer,
  onRowClick,
  focusedRowId,
  href,
}: InfiniteDataTableRowProps<TData>) {
  const router = useRouter();

  const handleOnClick = useCallback(
    (event: MouseEvent<HTMLTableRowElement>) => {
      // handle meta key - opening link in new tab.
      if (href && (event.metaKey || event.ctrlKey)) {
        window.open(href, "_blank");
        return;
      }

      onRowClick?.(row);

      if (href) {
        router.push(href);
      }
    },
    [href, onRowClick, row, router]
  );

  const handleAuxClick = useCallback(
    (event: MouseEvent<HTMLTableRowElement>) => {
      if (href && event.button === 1) {
        event.preventDefault();
        window.open(href, "_blank");
      }
    },
    [href]
  );

  return (
    <TableRow
      data-index={virtualRow.index}
      ref={(node) => rowVirtualizer.measureElement(node)}
      className={cn(
        "flex min-w-full border-b last:border-b-0 group/row relative",
        (!!onRowClick || !!href) && "cursor-pointer",
        row.depth > 0 && "bg-secondary/40",
        focusedRowId === row.id && "bg-muted"
      )}
      key={row.id}
      data-state={row.getIsSelected() && "selected"}
      onClick={handleOnClick}
      onAuxClick={handleAuxClick}
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
