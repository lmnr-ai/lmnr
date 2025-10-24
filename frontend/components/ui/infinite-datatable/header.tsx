import { flexRender, RowData } from "@tanstack/react-table";

import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { InfiniteDataTableHeaderProps } from "./types";

export function InfiniteDatatableHeader<TData extends RowData>({ table }: InfiniteDataTableHeaderProps<TData>) {
  return (
    <TableHeader
      className="text-xs flex bg-sidebar rounded-t"
      style={{
        display: "grid",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow className="p-0 m-0 w-full rounded-tl rounded-tr flex" key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <TableHead
              colSpan={header.colSpan}
              style={{
                height: 32,
                width: header.getSize(),
                minWidth: header.getSize(),
                display: "flex",
              }}
              className="m-0 relative text-secondary-foreground truncate"
              key={header.id}
            >
              <div className="absolute inset-0 items-center h-full flex group px-4">
                <div className="text-ellipsis overflow-hidden whitespace-nowrap text-secondary-foreground">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  <div
                    className={cn(
                      "group-hover:bg-blue-300 group-hover:w-[2px] absolute w-px bottom-0 top-0 right-0 bg-primary h-full cursor-col-resize transition-colors",
                      header.column.getIsResizing() ? "bg-blue-400" : "bg-secondary"
                    )}
                    onMouseDown={header.getResizeHandler()}
                    onDoubleClick={() => header.column.resetSize()}
                  />
                </div>
              </div>
            </TableHead>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  );
}
