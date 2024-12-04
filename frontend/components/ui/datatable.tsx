import {
  ColumnDef,
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  Row,
  useReactTable
} from '@tanstack/react-table';
import { X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { Button } from './button';
import { DataTablePagination } from './datatable-pagination';
import { Label } from './label';
import { ScrollArea, ScrollBar } from './scroll-area';
import { Skeleton } from './skeleton';

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
  onSelectedRowsChange?: (selectedRows: string[]) => void;
  // since we are using manual pagination, we need to know when the user selects all rows across all pages
  // we cannot fetch all rowIds on the client side, so we need to know when the user selects all rows across all pages
  // and manage that externally
  onSelectAllAcrossPages?: (selectAll: boolean) => void;
  children?: React.ReactNode;
  selectionPanel?: (selectedRowIds: string[]) => React.ReactNode;
}

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
  onSelectedRowsChange,
  onSelectAllAcrossPages,
  children,
  selectionPanel,
}: DataTableProps<TData>) {
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [allRowsAcrossAllPagesSelected, setAllRowsAcrossAllPagesSelected] = useState(false);
  const [expandedRows, setExpandedRows] = useState<ExpandedState>({});

  useEffect(() => {
    onSelectedRowsChange?.(Object.keys(rowSelection));
  }, [rowSelection]);

  useEffect(() => {
    // reset selection if data changes
    setRowSelection({});
  }, [data]);

  if (enableRowSelection) {
    columns.unshift({
      id: '__row_selection',
      enableResizing: false,
      header: ({ table }) => (
        <Checkbox
          className="border border-secondary"
          checked={table.getIsAllRowsSelected()}
          onCheckedChange={(checked) => {
            if (!checked) {
              setAllRowsAcrossAllPagesSelected(false);
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
      size: 24,
      cell: ({ row }) => (
        <Checkbox
          className={cn('border border-secondary mt-1')}
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => {
            if (!checked) {
              setAllRowsAcrossAllPagesSelected(false);
              onSelectAllAcrossPages?.(false);
            }
          }}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => {
            e.stopPropagation();
            row.toggleSelected(!row.getIsSelected());
          }}
        />
      )
    });
  }

  const table = useReactTable({
    data: data ?? [],
    columns,
    columnResizeMode: 'onChange',
    columnResizeDirection: 'ltr',
    getSubRows: (row: TData) => (row as any).subRows,
    enableExpanding: true,
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: (row) => true,
    onExpandedChange: setExpandedRows,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: !manualPagination
      ? getPaginationRowModel()
      : undefined,
    initialState: {
      pagination: {
        pageIndex: defaultPageNumber ?? 0,
        pageSize: defaultPageSize ?? DEFAULT_PAGE_SIZE
      }
    },
    defaultColumn: {
      minSize: 54
    },
    state: {
      rowSelection:
        allRowsAcrossAllPagesSelected && getRowId
          ? Object.fromEntries(data?.map((row) => [getRowId(row), true]) ?? [])
          : rowSelection,
      expanded: expandedRows
    },
    manualPagination: manualPagination,
    pageCount: pageCount == -1 ? undefined : pageCount,
    enableRowSelection, //enable or disable row selection for all rows
    enableMultiRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getRowId: getRowId
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
        'flex min-w-full border-b',
        !!onRowClick && 'cursor-pointer',
        row.depth > 0 && 'bg-secondary/40',
        focusedRowId === row.id && 'bg-secondary/50'
      )}
      key={row.id}
      data-state={row.getIsSelected() && 'selected'}
      onClick={() => {
        onRowClick?.(row);
      }}
    >
      {row.getVisibleCells().map((cell: any, index) => (
        <TableCell
          className="relative p-0 m-0"
          key={cell.id}
          style={{
            height: '38px',
            width: cell.column.getSize()
          }}
        >
          {row.getIsSelected() && index === 0 && (
            <div className="border-l-2 border-l-primary absolute h-full left-0 top-0"></div>
          )}
          <div className="absolute inset-0 items-center h-full flex px-4">
            <div className="text-ellipsis overflow-hidden whitespace-nowrap">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
          </div>
        </TableCell>
      ))}
      <TableCell className="flex-1"></TableCell>
    </TableRow>
  );

  const content = (
    <Table
      className="border-separate border-spacing-0 relative"
      style={{
        width: table
          .getHeaderGroups()[0]
          .headers.reduce((acc, header) => acc + header.getSize(), 0)
      }}
    >
      <TableHeader className="sticky top-0 z-20 text-xs bg-background flex">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow
            className="hover:bg-background p-0 m-0 w-full"
            key={headerGroup.id}
          >
            {headerGroup.headers.map((header) => (
              <TableHead
                colSpan={header.colSpan}
                style={{
                  width: header.getSize()
                }}
                className="p-0 m-0 relative"
                key={header.id}
              >
                <div className="absolute inset-0 items-center h-full border-r flex px-4 group">
                  <div className="text-ellipsis overflow-hidden whitespace-nowrap text-secondary-foreground">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    <div
                      className={cn(
                        ' group-hover:bg-blue-300 group-hover:w-[2px] absolute w-[1px] bottom-0 top-0 right-0 bg-primary h-full cursor-col-resize transition-colors',
                        header.column.getIsResizing()
                          ? 'bg-blue-400'
                          : 'bg-secondary'
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
      <TableBody className="">
        {table.getRowModel().rows.length > 0 ? (
          table.getRowModel().rows.map(renderRow)
        ) : data !== undefined ? (
          (emptyRow ?? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center p-4 text-secondary-foreground"
              >
                No results
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-center">
              <div className="flex flex-col space-y-2">
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
    <div className={cn('flex flex-col h-full border-t relative', className)}>
      {Object.keys(rowSelection).length > 0 && (
        <div className="bg-background h-12 flex flex-none px-4 items-center border-primary border-[1.5px] rounded-lg absolute bottom-20 z-50 left-1/2 transform -translate-x-1/2">
          <Label className="">
            {`${Object.keys(rowSelection).length} ${Object.keys(rowSelection).length === 1 ? 'row ' : 'rows '}`}
            selected
          </Label>
          <Button
            variant="ghost"
            onClick={() => {
              table.toggleAllRowsSelected(false);
              setAllRowsAcrossAllPagesSelected(false);
              onSelectAllAcrossPages?.(false);
              setRowSelection({});
            }}
          >
            <X size={12} />
          </Button>
          {selectionPanel?.(Object.keys(rowSelection))}
        </div>
      )}
      {children && (
        <div className="flex items-center space-x-2 h-12 px-4 border-b">
          {children}
        </div>
      )}
      <ScrollArea className="flex-grow overflow-auto">
        <div className="max-h-0">{content}</div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      {paginated && (
        <div className="flex-none p-4 border-t">
          <DataTablePagination
            table={table}
            defaultPageSize={defaultPageSize ?? DEFAULT_PAGE_SIZE}
            onPageChange={() => {
              // using timeout to ensure that the page index is updated
              setTimeout(() => {
                onPageChange?.(
                  table.getState().pagination.pageIndex,
                  table.getState().pagination.pageSize
                );
              }, 100);
            }}
            totalItemsCount={totalItemsCount}
          />
        </div>
      )}
    </div>
  );
}
