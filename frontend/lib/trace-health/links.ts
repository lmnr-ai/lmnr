import { createSerializer, parseAsArrayOf, parseAsString } from "nuqs";

import { type Filter } from "@/lib/actions/common/filter-schemas";
import { Operator } from "@/lib/actions/common/operators";

import { type TraceHealthCheck, type TraceHealthCheckResult } from "./checks";

// Same parsers the traces/spans tables read with (nuqs arrays are ONE comma-joined param, not repeated keys).
const serializeTableParams = createSerializer({
  view: parseAsString,
  filter: parseAsArrayOf(parseAsString),
  startDate: parseAsString,
  endDate: parseAsString,
  pastHours: parseAsString,
});

/** Traces page URL showing the check's offending traces or spans, or null when there is nothing to show. */
export const buildCheckTableHref = (
  projectId: string,
  check: TraceHealthCheck,
  result: TraceHealthCheckResult,
  oldestStart: string | null
) => {
  const filters: Filter[] =
    "filters" in check.table
      ? check.table.filters
      : result.matchIds.map((id) => ({
          column: (check.table as { idColumn: string }).idColumn,
          operator: Operator.Eq,
          value: id,
          dataType: "string",
        }));
  if (filters.length === 0) return null;

  const range = oldestStart ? { startDate: oldestStart, endDate: new Date().toISOString() } : { pastHours: "24" };
  return serializeTableParams(`/project/${projectId}/traces`, {
    view: check.table.view,
    filter: filters.map((f) => JSON.stringify(f)),
    ...range,
  });
};
