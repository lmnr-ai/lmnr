import { type DateRange } from "@/components/ui/date-range-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";

export const RESOURCE = "signals";
export const FETCH_SIZE = 50;

export const DEFAULT_SPARKLINE_PAST_HOURS = "168";

export const defaultSignalsColumnOrder = [
  "__row_selection",
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

export const SIGNAL_QUICK_RANGES: DateRange[] = [
  { name: "1 hour", value: "1" },
  { name: "3 hours", value: "3" },
  { name: "1 day", value: "24" },
  { name: "3 days", value: String(24 * 3) },
  { name: "1 week", value: String(24 * 7) },
  { name: "1 month", value: String(24 * 30) },
];

export const signalsTableFilters: ColumnFilter[] = [
  { name: "ID", key: "id", dataType: "string" },
  { name: "Name", key: "name", dataType: "string" },
];
