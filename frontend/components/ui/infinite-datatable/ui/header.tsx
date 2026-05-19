import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { type RowData } from "@tanstack/react-table";
import { forwardRef, useCallback } from "react";
import { useStore } from "zustand";
import { shallow } from "zustand/shallow";

import { TableHeader, TableRow } from "@/components/ui/table.tsx";

import { useDataTableStore } from "../model/datatable-store.tsx";
import { type InfiniteDataTableHeaderProps } from "../model/types.ts";
import { InfiniteTableHead } from "./head.tsx";

export const InfiniteDatatableHeader = forwardRef<HTMLTableSectionElement, InfiniteDataTableHeaderProps<RowData>>(
  function InfiniteDatatableHeader<TData extends RowData>(
    { table }: InfiniteDataTableHeaderProps<TData>,
    ref: React.Ref<HTMLTableSectionElement>
  ) {
    const store = useDataTableStore();
    const { lockedColumns, disableHideColumn, columnVisibility, setColumnVisibility } = useStore(
      store,
      (state) => ({
        lockedColumns: state.lockedColumns,
        disableHideColumn: state.disableHideColumn,
        columnVisibility: state.columnVisibility,
        setColumnVisibility: state.setColumnVisibility,
      }),
      shallow
    );

    const onHideColumn = useCallback(
      (columnId: string) => {
        setColumnVisibility({ ...columnVisibility, [columnId]: false });
      },
      [columnVisibility, setColumnVisibility]
    );

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
        {table.getHeaderGroups().map((headerGroup) => {
          const sortableIds = headerGroup.headers.map((h) => h.column.id);
          return (
            <TableRow className="p-0 m-0 w-full rounded-tl rounded-tr flex" key={headerGroup.id}>
              <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
                {headerGroup.headers.map((header) => (
                  <InfiniteTableHead
                    key={header.id}
                    header={header}
                    onHideColumn={disableHideColumn ? undefined : onHideColumn}
                    isControllable={!lockedColumns.includes(header.column.id)}
                  />
                ))}
              </SortableContext>
            </TableRow>
          );
        })}
      </TableHeader>
    );
  }
);
