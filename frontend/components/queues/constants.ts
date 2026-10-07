import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

export const RESOURCE = "queues";
export const FETCH_SIZE = 50;

export const queuesTableFilters: ColumnFilter[] = [
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
    name: "Total items",
    key: "total",
    dataType: "number",
  },
  {
    name: "New",
    key: "new",
    dataType: "number",
  },
  {
    name: "Modified",
    key: "modified",
    dataType: "number",
  },
  {
    name: "Approved",
    key: "approved",
    dataType: "number",
  },
];
