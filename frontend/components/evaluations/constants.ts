import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

export const FETCH_SIZE = 50;
export const RESOURCE = "evaluations";

export const defaultEvaluationsColumnOrder = [
  "__row_selection",
  "__chart_visibility",
  "id",
  "name",
  "dataPointsCount",
  "metadata",
  "createdAt",
];

export const filters: ColumnFilter[] = [
  { name: "ID", key: "id", dataType: "string" },
  { name: "Name", key: "name", dataType: "string" },
  { name: "Datapoints Count", key: "dataPointsCount", dataType: "number" },
  { name: "Metadata", key: "metadata", dataType: "json" },
];
