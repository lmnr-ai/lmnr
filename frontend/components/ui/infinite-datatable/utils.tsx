import { ColumnDef, RowData } from "@tanstack/react-table";

import { Checkbox } from "@/components/ui/checkbox.tsx";

import { CheckboxColumnOptions } from "./types.ts";

export const EMPTY_ARRAY: RowData[] = [];

export function createCheckboxColumn<TData extends RowData>(options?: CheckboxColumnOptions): ColumnDef<TData> {
  return {
    id: "__row_selection",
    enableResizing: false,
    size: 52,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllRowsSelected()}
        onCheckedChange={(checked) => {
          table.toggleAllRowsSelected(!!checked);
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => {
          row.toggleSelected(!!checked);
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      />
    ),
  };
}

export function getColumnLabels<TData>(columns: ColumnDef<TData, any>[]): Record<string, string> {
  return columns.reduce(
    (acc, col: ColumnDef<TData, any>) => {
      let id;
      if (col.id) {
        id = col.id;
      } else if ("accessorKey" in col) {
        id = col.accessorKey as string;
      } else {
        return acc;
      }

      let label = id;
      if (typeof col.header === "string") {
        label = col.header;
      } else if (col.meta && "label" in col.meta && typeof col.meta.label === "string") {
        label = col.meta.label;
      }
      return { ...acc, [id]: label };
    },
    {} as Record<string, string>
  );
}
