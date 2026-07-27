import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

export const RESOURCE = "datasets";
export const FETCH_SIZE = 50;

export const datasetsTableFilters: ColumnFilter[] = [
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
  {
    name: "Datapoints count",
    key: "count",
    dataType: "number",
  },
];
