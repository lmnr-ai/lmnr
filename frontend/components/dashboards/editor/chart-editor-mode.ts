import { tableSchemas } from "@/components/dashboards/editor/table-schemas";
import { convertSqlToJson } from "@/components/dashboards/editor/utils";
import { type DashboardChart } from "@/components/dashboards/types";
import { type QueryStructure } from "@/lib/actions/sql/types";

export type EditorMode = "visual" | "sql";

type ResolvedEditorMode = { mode: "visual"; structure: QueryStructure } | { mode: "sql" };

type ConvertSql = (projectId: string, sql: string) => Promise<QueryStructure>;

// `/sql/to-json` already rejects SQL its structure can't regenerate; this skips the
// round trip for clauses the builder never emits.
const UNREPRESENTABLE_SQL = /^\s*WITH\b|\b(?:JOIN|HAVING|PREWHERE|QUALIFY|WINDOW|UNION|INTERSECT|EXCEPT)\b/i;

/** The visual builder's structure for `query`, or null when the builder cannot represent it faithfully. */
export async function parseVisualStructure(
  query: string,
  projectId: string,
  convert: ConvertSql = convertSqlToJson
): Promise<QueryStructure | null> {
  if (UNREPRESENTABLE_SQL.test(query)) return null;

  try {
    const structure = await convert(projectId, query);
    return Object.hasOwn(tableSchemas, structure.table) ? structure : null;
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
  const structure = await parseVisualStructure(chart.query, projectId, convert);
  return structure ? { mode: "visual", structure } : { mode: "sql" };
}
