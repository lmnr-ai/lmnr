import { type RowData } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { memo, type MouseEvent, useCallback } from "react";

import { TableRow } from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";

import { type InfiniteDataTableRowProps } from "../model/types.ts";
import { InfiniteTableCell } from "./cell.tsx";

function InfiniteDatatableRowInner<TData extends RowData>({
  virtualRow,
  row,
  onRowClick,
  onHoveredRowChange,
  focusedRowId,
  href,
  className,
  measureElement,
  isSelected,
}: InfiniteDataTableRowProps<TData>) {
  const router = useRouter();

  const handleOnClick = useCallback(
    (event: MouseEvent<HTMLTableRowElement>) => {
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
      ref={measureElement}
      className={cn(
        "flex min-w-full border-b last:border-b-0 group/row relative",
        (!!onRowClick || !!href) && "cursor-pointer",
        row.depth > 0 && "bg-secondary/40",
        focusedRowId === row.id && "bg-muted",
        className
      )}
      key={row.id}
      data-state={isSelected && "selected"}
      data-focused={focusedRowId === row.id || undefined}
      onClick={handleOnClick}
      onAuxClick={handleAuxClick}
      onMouseEnter={onHoveredRowChange ? () => onHoveredRowChange(row) : undefined}
      onMouseLeave={onHoveredRowChange ? () => onHoveredRowChange(null) : undefined}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${virtualRow.start}px)`,
        willChange: "transform",
      }}
    >
      {isSelected && <td className="border-l-2 border-l-primary absolute h-full left-0 top-0 z-10" />}
      {row.getVisibleCells().map((cell) => (
        <InfiniteTableCell key={cell.id} cell={cell} isSelected={isSelected} />
      ))}
    </TableRow>
  );
}

function areRowPropsEqual<TData extends RowData>(
  prev: InfiniteDataTableRowProps<TData>,
  next: InfiniteDataTableRowProps<TData>
) {
  return (
    prev.virtualRow.index === next.virtualRow.index &&
    prev.virtualRow.start === next.virtualRow.start &&
    prev.virtualRow.size === next.virtualRow.size &&
    prev.row.id === next.row.id &&
    prev.row.original === next.row.original &&
    prev.isSelected === next.isSelected &&
    prev.focusedRowId === next.focusedRowId &&
    prev.href === next.href &&
    prev.className === next.className &&
    prev.onRowClick === next.onRowClick &&
    prev.onHoveredRowChange === next.onHoveredRowChange
  );
}

export const InfiniteDatatableRow = memo(
  InfiniteDatatableRowInner,
  areRowPropsEqual
) as typeof InfiniteDatatableRowInner;
