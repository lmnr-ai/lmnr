import { type Row, type RowData } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { TableBody, TableCell, TableRow } from "@/components/ui/table.tsx";

import { type InfiniteDataTableBodyProps } from "../model/types.ts";
import { InfiniteDatatableRow } from "./row.tsx";

export function InfiniteDatatableBody<TData extends RowData>({
  table,
  rowVirtualizer,
  virtualItems,
  isLoading,
  isFetching,
  hasMore,
  onRowClick,
  focusedRowId,
  loadMoreRef,
  emptyRow,
  loadingRow,
  getRowHref,
  loadMoreButton,
  fetchNextPage,
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
  const totalSize = rowVirtualizer.getTotalSize();
  const buttonHeight = loadMoreButton && hasMore ? 36 : 0;

  return (
    <TableBody
      style={{
        height: isLoading ? "auto" : `${(totalSize > 0 ? totalSize : 52) + buttonHeight}px`,
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
                href={getRowHref?.(row)}
              />
            );
          })}
          {!loadMoreButton && !isLoading && hasMore && (
            <tr className="absolute border-b-0 bottom-0" ref={loadMoreRef} />
          )}
          {loadMoreButton && hasMore && (
            <tr
              className="absolute flex justify-center w-full"
              style={{
                transform: `translateY(${rowVirtualizer.getTotalSize()}px)`,
              }}
            >
              <td colSpan={columns.length} className="w-full flex justify-center py-1">
                {typeof loadMoreButton === "function" ? (
                  loadMoreButton({ onClick: fetchNextPage, isFetching, hasMore })
                ) : (
                  <Button
                    variant="ghost"
                    className="hover:bg-accent text-secondary-foreground"
                    onClick={fetchNextPage}
                    disabled={isFetching}
                  >
                    {isFetching ? <Loader2 className="size-4 animate-spin" /> : "Load More"}
                  </Button>
                )}
              </td>
            </tr>
          )}
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
