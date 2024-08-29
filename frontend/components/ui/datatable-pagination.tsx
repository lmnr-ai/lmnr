import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons"
import { type Table } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  pageSizeOptions?: number[]
  defaultPageSize: number
  onPageChange?: () => void
  totalItemsCount?: number
}

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 20, 50, 100, 200, 500],
  defaultPageSize,
  onPageChange,
  totalItemsCount,
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex w-full flex-col items-center justify-between gap-4 overflow-auto sm:flex-row sm:gap-8">
      <div className="flex-1 whitespace-nowrap text-sm text-muted-foreground">
        Total {totalItemsCount ?? (table.getFilteredRowModel().rows.length)} item(s)
      </div>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6 lg:gap-8">
        <div className="flex items-center space-x-2">
          <p className="whitespace-nowrap text-sm font-medium">Items per page</p>
          <Select
            defaultValue={`${defaultPageSize}`}
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              onPageChange?.()
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="h-8 w-16">
              <SelectValue>{table.getState().pagination.pageSize}</SelectValue>
            </SelectTrigger>
            <SelectContent side="bottom">
              {pageSizeOptions.map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-24 items-center justify-center text-sm font-medium">
          Page {table.getState().pagination.pageIndex + 1} of {(!table.getPageCount()) ? 1 : table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          {/* <Button
            aria-label="Go to first page"
            variant="outline"
            className="hidden size-8 p-0 lg:flex w-8"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <DoubleArrowLeftIcon className="size-4" aria-hidden="true" />
          </Button> */}
          <Button
            aria-label="Go to previous page"
            variant="outline"
            className="size-8 p-0 lg:flex w-8"
            onClick={() => {
              onPageChange?.()
              table.previousPage()
            }}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
          </Button>
          <Button
            aria-label="Go to next page"
            variant="outline"
            className="size-8 p-0 w-8"
            onClick={() => {
              onPageChange?.()
              table.nextPage()
            }}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </Button>
          {/* <Button
            aria-label="Go to last page"
            variant="outline"
            className="hidden size-8 p-0 lg:flex w-8"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <DoubleArrowRightIcon className="size-4" aria-hidden="true" />
          </Button> */}
        </div>
      </div>
    </div>
  )
}