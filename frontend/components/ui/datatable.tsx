import {
  ColumnDef,
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  Row,
  RowData,
  useReactTable,
} from "@tanstack/react-table";
import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { Dispatch, PropsWithChildren, SetStateAction, useEffect, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import { DataTablePagination } from "./datatable-pagination";
import { Label } from "./label";
import { Skeleton } from "./skeleton";
const DEFAULT_PAGE_SIZE = 50;

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[] | undefined;

  // If not provided, then the row id is the index of the row in the data array
  getRowId?: (row: TData) => string;

  onRowClick?: (row: Row<TData>) => void;

  // ID of the row id that should be expanded in the side sheet. If null or undefined, side sheet is closed.
  // For now, must be controlled from the outside.
  // NOTE: Set getRowId={(row) => row.id} (based on id primary key in the table)
  focusedRowId?: string | null;

  defaultPageSize?: number;
  defaultPageNumber?: number;
  paginated?: boolean;
  manualPagination?: boolean;
  emptyRow?: React.ReactNode;
  className?: string;
  pageCount?: number;
  onPageChange?: (pageNumber: number, pageSize: number) => void;
  totalItemsCount?: number;

  // Select row by clicking on the checkbox in the first column
  // Not related to what happens when you click on the row itself
  // NOTE: Set getRowId={(row) => row.id} (based on id primary key in the table)
  enableRowSelection?: boolean;
  selectedRowIds?: string[];
  onSelectedRowsChange?: (selectedRows: string[]) => void;
  // since we are using manual pagination, we need to know when the user selects all rows across all pages
  // we cannot fetch all rowIds on the client side, so we need to know when the user selects all rows across all pages
  // and manage that externally
  onSelectAllAcrossPages?: (selectAll: boolean) => void;
  selectionPanel?: (selectedRowIds: string[]) => React.ReactNode;
  pageSizeOptions?: number[];
  childrenClassName?: string;
  scrollContentClassName?: string;
}

const EMPTY_ARRAY: RowData[] = [];

const checkboxColumn = <TData,>(
  setAllRowsAcrossAllPagesSelected: Dispatch<SetStateAction<boolean>>,
  onSelectAllAcrossPages: DataTableProps<TData>["onSelectAllAcrossPages"]
): ColumnDef<TData> => ({
  id: "__row_selection",
  enableResizing: false,
  header: ({ table }) => (
    <Checkbox
      className="border border-secondary"
      checked={table.getIsAllRowsSelected()}
      onCheckedChange={(checked) => {
        if (!checked) {
          setAllRowsAcrossAllPagesSelected?.(false);
          onSelectAllAcrossPages?.(false);
        }
      }}
      onChange={table.getToggleAllRowsSelectedHandler()} // TODO: Think about row selection per page
      onClick={(e) => {
        e.stopPropagation();
        table.toggleAllRowsSelected(!table.getIsAllRowsSelected());
      }}
    />
  ),
  size: 52,
  cell: ({ row }) => (
    <Checkbox
      className={cn("border border-secondary")}
      checked={row.getIsSelected()}
      onCheckedChange={(checked) => {
        if (!checked) {
          setAllRowsAcrossAllPagesSelected?.(false);
          onSelectAllAcrossPages?.(false);
        }
      }}
      onChange={row.getToggleSelectedHandler()}
      onClick={(e) => {
        e.stopPropagation();
        row.toggleSelected(!row.getIsSelected());
      }}
    />
  ),
});

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  onRowClick,
  focusedRowId,
  defaultPageSize,
  defaultPageNumber,
  emptyRow,
  manualPagination = false,
  paginated = false,
  pageCount = -1,
  onPageChange,
  totalItemsCount,
  className,
  enableRowSelection = false,
  selectedRowIds: externalSelectedRowIds,
  onSelectedRowsChange,
  onSelectAllAcrossPages,
  children,
  selectionPanel,
  pageSizeOptions = [10, 20, 50, 100, 200, 500],
  childrenClassName,
  scrollContentClassName,
}: PropsWithChildren<DataTableProps<TData>>) {
  const [internalRowSelection, setInternalRowSelection] = useState<Record<string, boolean>>({});
  const [allRowsAcrossAllPagesSelected, setAllRowsAcrossAllPagesSelected] = useState(false);
  const [expandedRows, setExpandedRows] = useState<ExpandedState>({});

  const isExternallyControlled = externalSelectedRowIds !== undefined;
  const currentSelectedRowIds = isExternallyControlled ? externalSelectedRowIds : Object.keys(internalRowSelection);

  // Convert selectedRowIds array to selection object for react-table
  const rowSelection = isExternallyControlled
    ? Object.fromEntries(externalSelectedRowIds.map((id) => [id, true]))
    : internalRowSelection;

  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();

  const clearFilters = () => {
    // clear all filters
    if (searchParams !== null && searchParams.get("filter") !== null) {
      searchParams.delete("filter");
      router.push(`${pathName}?${searchParams.toString()}`);
    }
  };

  useEffect(() => {
    if (!isExternallyControlled) {
      onSelectedRowsChange?.(Object.keys(internalRowSelection));
    }
  }, [internalRowSelection, onSelectedRowsChange, isExternallyControlled]);

  useEffect(() => {
    if (!isExternallyControlled) {
      setInternalRowSelection({});
    }
  }, [data, isExternallyControlled]);

  const selectionColumns = enableRowSelection
    ? [checkboxColumn<TData>(setAllRowsAcrossAllPagesSelected, onSelectAllAcrossPages)]
    : [];

  const table = useReactTable<TData>({
    data: data || (EMPTY_ARRAY as TData[]),
    columns: [...selectionColumns, ...columns],
    columnResizeMode: "onChange",
    columnResizeDirection: "ltr",
    getSubRows: (row: TData) => (row as any).subRows,
    enableExpanding: true,
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: (row) => true,
    onExpandedChange: setExpandedRows,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: !manualPagination ? getPaginationRowModel() : undefined,
    initialState: {
      pagination: {
        pageIndex: defaultPageNumber ?? 0,
        pageSize: defaultPageSize ?? DEFAULT_PAGE_SIZE,
      },
    },
    defaultColumn: {
      minSize: 32,
    },
    state: {
      rowSelection:
        allRowsAcrossAllPagesSelected && getRowId
          ? Object.fromEntries(data?.map((row) => [getRowId(row), true]) ?? [])
          : rowSelection,
      expanded: expandedRows,
    },
    manualPagination: manualPagination,
    pageCount: pageCount == -1 ? undefined : pageCount,
    enableRowSelection, //enable or disable row selection for all rows
    enableMultiRowSelection: true,
    onRowSelectionChange: isExternallyControlled
      ? (updater) => {
          // For externally controlled state, we need to convert the updater function result back to array
          const newSelection = typeof updater === "function" ? updater(rowSelection) : updater;
          const newSelectedIds = Object.keys(newSelection);
          onSelectedRowsChange?.(newSelectedIds);
        }
      : setInternalRowSelection,
    getRowId: getRowId,
  });

  // for manual pagination, we need to set the page index if it is updated externally
  // we don't call onPageChange to avoid infinite loop
  useEffect(() => {
    table.setPageIndex(defaultPageNumber ?? 0);
    // if (allRowsAcrossAllPagesSelected) {
    //   table.toggleAllRowsSelected(true)
    // }
  }, [defaultPageNumber]);

  const renderRow = (row: Row<TData>) => (
    <TableRow
      className={cn(
        "flex min-w-full border-b last:border-b-0 group/row",
        !!onRowClick && "cursor-pointer",
        row.depth > 0 && "bg-secondary/40",
        focusedRowId === row.id && "bg-secondary/70"
      )}
      key={row.id}
      data-state={row.getIsSelected() && "selected"}
      onClick={() => {
        onRowClick?.(row);
      }}
    >
      {row.getVisibleCells().map((cell: any, index) => (
        <TableCell
          className="relative px-4 m-0 truncate h-full my-auto"
          key={cell.id}
          style={{
            width: cell.column.getSize(),
          }}
        >
          {row.getIsSelected() && index === 0 && (
            <div className="border-l-2 border-l-primary absolute h-full left-0 top-0"></div>
          )}
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
      <TableCell className="flex-1"></TableCell>
    </TableRow>
  );

  const content = (
    <Table
      className="border-separate border-spacing-0 relative border-x border-b rounded bg-sidebar text-xs overflow-hidden"
      style={{
        width: table.getHeaderGroups()[0].headers.reduce((acc, header) => acc + header.getSize(), 0),
      }}
    >
      <TableHeader className="sticky top-0 z-20 text-xs flex bg-sidebar rounded-t border-t">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow className="p-0 m-0 w-full rounded-tl rounded-tr" key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                colSpan={header.colSpan}
                style={{
                  height: 32,
                  width: header.getSize(),
                  minWidth: header.getSize(),
                }}
                className="m-0 relative text-secondary-foreground truncate first:rounded-tl last:rounded-tr"
                key={header.id}
              >
                <div className="absolute inset-0 items-center h-full border-r flex group px-4">
                  <div className="text-ellipsis overflow-hidden whitespace-nowrap text-secondary-foreground">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    <div
                      className={cn(
                        " group-hover:bg-blue-300 group-hover:w-[2px] absolute w-px bottom-0 top-0 right-0 bg-primary h-full cursor-col-resize transition-colors",
                        header.column.getIsResizing() ? "bg-blue-400" : "bg-secondary"
                      )}
                      onMouseDown={header.getResizeHandler()}
                      onDoubleClick={() => header.column.resetSize()}
                    ></div>
                  </div>
                </div>
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length > 0 ? (
          table.getRowModel().rows.map(renderRow)
        ) : data !== undefined ? (
          (emptyRow ?? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center p-4 text-secondary-foreground rounded-b">
                {searchParams.get("filter") !== null ? "Applied filters returned no results. " : "No results"}
                {searchParams.get("filter") !== null && (
                  <span className="text-primary hover:cursor-pointer" onClick={clearFilters}>
                    Clear filters
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-center">
              <div className="flex flex-col space-y-2 p-1">
                <Skeleton className="w-full h-8" />
                <Skeleton className="w-full h-8" />
                <Skeleton className="w-full h-8" />
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className={cn("flex flex-col flex-1 gap-2 relative overflow-hidden", className)}>
      {currentSelectedRowIds.length > 0 && (
        <div className="bg-background h-12 flex flex-none px-4 items-center border-primary border-[1.5px] rounded-lg absolute bottom-20 z-50 left-1/2 transform -translate-x-1/2">
          <Label>
            {`${currentSelectedRowIds.length} ${currentSelectedRowIds.length === 1 ? "row " : "rows "}`}
            selected
          </Label>
          <Button
            variant="ghost"
            onClick={() => {
              table.toggleAllRowsSelected(false);
              setAllRowsAcrossAllPagesSelected(false);
              onSelectAllAcrossPages?.(false);
              if (isExternallyControlled) {
                onSelectedRowsChange?.([]);
              } else {
                setInternalRowSelection({});
              }
            }}
          >
            <X size={12} />
          </Button>
          {selectionPanel?.(currentSelectedRowIds)}
        </div>
      )}
      {children && <div className={cn("flex items-center px-4 space-x-2 h-12", childrenClassName)}>{children}</div>}
      <ScrollArea className="flex-1 overflow-auto">
        <div className={scrollContentClassName}>{content}</div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      {paginated && (
        <div className="flex-none px-4 py-2 border-t">
          <DataTablePagination
            table={table}
            pageSizeOptions={pageSizeOptions}
            defaultPageSize={defaultPageSize ?? DEFAULT_PAGE_SIZE}
            onPageChange={() => {
              // using timeout to ensure that the page index is updated
              setTimeout(() => {
                onPageChange?.(table.getState().pagination.pageIndex, table.getState().pagination.pageSize);
              }, 100);
            }}
            totalItemsCount={totalItemsCount}
          />
        </div>
      )}
    </div>
  );
}
