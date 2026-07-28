import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

export const RESOURCE = "playgrounds";
export const FETCH_SIZE = 50;

export const playgroundsTableFilters: ColumnFilter[] = [
  {
    name: "ID",
    key: "id",
    dataType: "string",
  },
  {
    name: "Name",
    key: "name",
    dataType: "string",
  },
];
