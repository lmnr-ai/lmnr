import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { RowData } from "@tanstack/react-table";
import { forwardRef } from "react";

import { TableHeader, TableRow } from "@/components/ui/table";

import { InfiniteDataTableHeaderProps } from "../types";
import { InfiniteTableHead } from "./head";

export const InfiniteDatatableHeader = forwardRef<HTMLTableSectionElement, InfiniteDataTableHeaderProps<RowData>>(
  function InfiniteDatatableHeader<TData extends RowData>(
    { table, columnOrder, onHideColumn, lockedColumns }: InfiniteDataTableHeaderProps<TData>,
    ref: React.Ref<HTMLTableSectionElement>
  ) {
    return (
      <TableHeader
        ref={ref}
        className="text-xs flex bg-secondary rounded-t"
        style={{
          display: "grid",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow className="p-0 m-0 w-full rounded-tl rounded-tr flex" key={headerGroup.id}>
            <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
              {headerGroup.headers.map((header) => (
                <InfiniteTableHead
                  key={header.id}
                  header={header}
                  onHideColumn={onHideColumn}
                  isControllable={!lockedColumns?.includes(header.column.id)}
                />
              ))}
            </SortableContext>
          </TableRow>
        ))}
      </TableHeader>
    );
  }
);
