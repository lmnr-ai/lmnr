import { flexRender, RowData } from "@tanstack/react-table";

import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { InfiniteDataTableHeaderProps } from "./types";

export function InfiniteDatatableHeader<TData extends RowData>({ table }: InfiniteDataTableHeaderProps<TData>) {
  return (
    <TableHeader className="text-xs bg-secondary rounded-t sticky top-0 z-20">
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow
          className="p-0 m-0 w-full rounded-tl rounded-tr bg-secondary border-b-0!"
          key={headerGroup.id}
          style={{
            boxShadow: "0 1px 0 0 hsl(var(--border))",
          }}
        >
          {headerGroup.headers.map((header) => (
            <TableHead
              colSpan={header.colSpan}
              style={{
                height: 32,
                width: header.getSize(),
                boxShadow: "0 1px 0 0 hsl(var(--border))",
              }}
              className="m-0 relative text-secondary-foreground truncate"
              key={header.id}
            >
              <div className="absolute inset-0 items-center flex group px-4 h-8">
                <div className="text-ellipsis overflow-hidden whitespace-nowrap text-secondary-foreground">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  <div
                    className={cn(
                      "group-hover:bg-blue-300 group-hover:w-[2px] absolute w-px bottom-0 top-0 right-0 h-full cursor-col-resize transition-colors",
                      header.column.getIsResizing() ? "bg-blue-400" : "bg-transparent"
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
