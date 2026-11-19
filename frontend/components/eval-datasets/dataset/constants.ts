import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

import { taskColumns } from "./columns";
import { type TaskRow } from "./rows";

export const RESOURCE = "eval-dataset";

export const defaults = { columnOrder: ["task", "version", "pushedAt", "createdAt"] };

export const searchFilters: ColumnFilter[] = [{ name: "Task", key: "task", dataType: "string" }];

export const filterFields = {
  task: (r: TaskRow) => r.taskId,
};

export const columnLabels = taskColumns.map((c) => ({ id: c.id!, label: String(c.header) }));
