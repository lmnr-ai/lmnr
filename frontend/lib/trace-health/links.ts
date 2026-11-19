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

const idFilter = (column: string, value: string): Filter => ({
  column,
  operator: Operator.Eq,
  value,
  dataType: "string",
});

/** Traces page URL showing the check's offending traces or spans, or null when there is nothing to show. */
export const buildCheckTableHref = (
  projectId: string,
  check: TraceHealthCheck,
  result: TraceHealthCheckResult,
  oldestStart: string | null
) => {
  const table = check.table;
  let filters: Filter[];
  if ("idColumn" in table) {
    if (result.matchIds.length === 0) return null;
    // Repeated `=` filters on an id column are ORed by the table; distinct columns are ANDed.
    filters = [
      ...("filters" in table ? table.filters : []),
      ...result.matchIds.map((id) => idFilter(table.idColumn, id)),
      ...(table.view === "spans" ? result.matchTraceIds.map((id) => idFilter("trace_id", id)) : []),
    ];
  } else {
    filters = table.filters;
  }

  const range = oldestStart ? { startDate: oldestStart, endDate: new Date().toISOString() } : { pastHours: "24" };
  return serializeTableParams(`/project/${projectId}/traces`, {
    view: check.table.view,
    filter: filters.map((f) => JSON.stringify(f)),
    ...range,
  });
};
