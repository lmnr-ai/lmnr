import { Row, RowData } from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";

import { InfiniteDatatableRow } from "./row";
import { InfiniteDataTableBodyProps } from "./types";

export function InfiniteDatatableBody<TData extends RowData>({
  table,
  rowVirtualizer,
  virtualItems,
  isLoading,
  hasMore,
  onRowClick,
  focusedRowId,
  loadMoreRef,
  emptyRow,
  loadingRow,
  error,
}: InfiniteDataTableBodyProps<TData>) {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();

  const clearFilters = () => {
    const sp = new URLSearchParams(searchParams.toString());
    if (sp !== null && sp.get("filter") !== null) {
      sp.delete("filter");
      router.push(`${pathName}?${sp.toString()}`);
    }
  };

  const { rows } = table.getRowModel();
  const columns = table.getAllColumns().filter((col) => col.id !== "__row_selection");

  return (
    <TableBody
      style={{
        height: isLoading ? "auto" : `${rowVirtualizer.getTotalSize() > 0 ? rowVirtualizer.getTotalSize() : 52}px`,
        position: "relative",
        display: "block",
      }}
    >
      {isLoading ? (
        (loadingRow ?? (
          <tr className="flex">
            <td colSpan={columns.length} className="w-full">
              <div className="flex flex-col w-full gap-y-2 p-2">
                <Skeleton className="w-full h-8" />
                <Skeleton className="w-full h-8" />
                <Skeleton className="w-full h-8" />
              </div>
            </td>
          </tr>
        ))
      ) : rows.length > 0 ? (
        <>
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index] as Row<TData>;
            return (
              <InfiniteDatatableRow
                key={row.id}
                virtualRow={virtualRow}
                row={row}
                rowVirtualizer={rowVirtualizer}
                onRowClick={onRowClick}
                focusedRowId={focusedRowId}
              />
            );
          })}
          {!isLoading && hasMore && <tr className="absolute border-b-0 bottom-0" ref={loadMoreRef} />}
        </>
      ) : (
        (emptyRow ?? (
          <TableRow className="flex">
            <TableCell colSpan={columns.length} className="text-center p-4 text-secondary-foreground rounded-b w-full">
              {searchParams.get("filter") !== null ? "Applied filters returned no results. " : "No results"}
              {searchParams.get("filter") !== null && (
                <span className="text-primary hover:cursor-pointer" onClick={clearFilters}>
                  Clear filters
                </span>
              )}
            </TableCell>
          </TableRow>
        ))
      )}
    </TableBody>
  );
}
