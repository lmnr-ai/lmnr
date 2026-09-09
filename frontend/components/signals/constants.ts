import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

export const RESOURCE = "signals";
export const FETCH_SIZE = 50;

export const DEFAULT_SPARKLINE_PAST_HOURS = "168";

export const defaultSignalsColumnOrder = [
  "__row_selection",
  "status",
  "name",
  "prompt",
  "eventsCount",
  "clustersCount",
  "sparkline",
  "lastEventAt",
  "runsCount",
  "versionsCount",
  "createdAt",
];

export const defaultSignalsColumnVisibility: Record<string, boolean> = {
  prompt: false,
};

export const signalsTableFilters: ColumnFilter[] = [
  { name: "ID", key: "id", dataType: "string" },
  { name: "Name", key: "name", dataType: "string" },
];
