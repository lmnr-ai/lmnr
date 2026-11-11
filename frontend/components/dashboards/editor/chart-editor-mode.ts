import { isEqual, isNil, omitBy, sortBy } from "lodash";

import { type ChartType } from "@/components/chart-builder/types";
import { tableSchemas } from "@/components/dashboards/editor/table-schemas";
import { buildQueryStructure, convertSqlToJson, toFormValues } from "@/components/dashboards/editor/utils";
import { type DashboardChart } from "@/components/dashboards/types";
import { type Filter, type QueryStructure } from "@/lib/actions/sql/types";

export type EditorMode = "visual" | "sql";

type ResolvedEditorMode = { mode: "visual"; structure: QueryStructure } | { mode: "sql" };

type ConvertSql = (projectId: string, sql: string) => Promise<QueryStructure>;

// `/sql/to-json` already rejects SQL its structure can't regenerate; this skips the
// round trip for clauses the builder never emits.
const UNREPRESENTABLE_SQL = /^\s*WITH\b|\b(?:JOIN|HAVING|PREWHERE|QUALIFY|WINDOW|UNION|INTERSECT|EXCEPT)\b/i;

const filterKey = (filter: Filter) =>
  [filter.field, filter.op, "stringValue" in filter ? filter.stringValue : filter.numberValue].join(" ");

// AND-ed filters compare in any order, and an unset optional field equals a missing one.
const comparable = (structure: QueryStructure) =>
  omitBy({ ...structure, filters: sortBy(structure.filters, filterKey) }, isNil);

/**
 * Whether the visual form regenerates `structure` as it is. The form replaces the chart's query
 * with its own SQL as soon as it opens, built from its rewrite of the structure for the chart
 * type, so a structure the rewrite changes would overwrite the saved query with a different one.
 */
export const formKeepsStructure = (structure: QueryStructure, chartType: ChartType | undefined): boolean =>
  isEqual(comparable(buildQueryStructure(toFormValues(structure, chartType), chartType)), comparable(structure));

/** The visual builder's structure for `query`, or null when the builder cannot represent it faithfully. */
export async function parseVisualStructure(
  query: string,
  projectId: string,
  chartType: ChartType | undefined,
  convert: ConvertSql = convertSqlToJson
): Promise<QueryStructure | null> {
  if (UNREPRESENTABLE_SQL.test(query)) return null;

  try {
    const structure = await convert(projectId, query);
    return Object.hasOwn(tableSchemas, structure.table) && formKeepsStructure(structure, chartType) ? structure : null;
  } catch {
    // SQL can be executable yet outside the visual builder's supported subset.
    return null;
  }
}

export async function resolveChartEditorMode(
  chart: Pick<DashboardChart, "query" | "settings">,
  projectId: string,
  convert: ConvertSql = convertSqlToJson
): Promise<ResolvedEditorMode> {
  if (!UNREPRESENTABLE_SQL.test(chart.query) && chart.settings.queryStructure) {
    return { mode: "visual", structure: chart.settings.queryStructure };
  }
  const structure = await parseVisualStructure(chart.query, projectId, chart.settings.config.type, convert);
  return structure ? { mode: "visual", structure } : { mode: "sql" };
}
