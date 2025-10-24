import { ColumnDef, RowData } from "@tanstack/react-table";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { CheckboxColumnOptions } from "./types";

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
