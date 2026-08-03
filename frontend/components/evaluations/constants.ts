import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { EVALUATION_STATUS_LABELS, EVALUATION_STATUSES } from "@/lib/evaluation/status";

export const FETCH_SIZE = 50;
export const RESOURCE = "evaluations";

export const defaultEvaluationsColumnOrder = [
  "__row_selection",
  "__chart_visibility",
  "id",
  "name",
  "status",
  "dataPointsCount",
  "metadata",
  "createdAt",
];

export const filters: ColumnFilter[] = [
  { name: "ID", key: "id", dataType: "string" },
  { name: "Name", key: "name", dataType: "string" },
  {
    name: "Status",
    key: "status",
    dataType: "enum",
    options: EVALUATION_STATUSES.map((value) => ({ label: EVALUATION_STATUS_LABELS[value], value })),
  },
  { name: "Datapoints Count", key: "dataPointsCount", dataType: "number" },
  { name: "Metadata", key: "metadata", dataType: "json" },
];
