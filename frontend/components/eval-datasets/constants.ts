import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

import { evalDatasetsColumns } from "./columns";

export const RESOURCE = "eval-datasets";

export const defaults = { columnOrder: ["name", "taskCount", "lastPushedAt", "createdAt"] };

export const searchFilters: ColumnFilter[] = [
  { name: "Name", key: "name", dataType: "string" },
  { name: "Tasks", key: "taskCount", dataType: "number" },
];

export const columnLabels = evalDatasetsColumns.map((c) => ({ id: c.id!, label: String(c.header) }));
