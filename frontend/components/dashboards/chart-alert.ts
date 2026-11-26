import { CHART_PRESETS } from "@/components/dashboards/chart-presets";
import { type DashboardChart } from "@/components/dashboards/types";
import { type MetricAlertPreset } from "@/components/settings/alerts/metric-alerts/metric-alert-sheet/types";
import { type QueryStructure, QueryStructureSchema } from "@/lib/actions/sql/types";

/** The preset charts a metric alert can watch, by preset name. */
const ALERTABLE_PRESETS: Record<string, Omit<MetricAlertPreset, "name">> = {
  "Total cost": { metric: "total_cost" },
  "Total tokens": { metric: "total_tokens" },
  "Tokens by model": { metric: "total_tokens", splitByModel: true },
  "New traces": { metric: "trace_count" },
};

// Formatting that differs between a preset and the same chart seeded into a new project.
const normalizeQuery = (query: string) =>
  query
    .replace(/`/g, "")
    .replace(/\s+ASC\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const structureKey = ({ table, metrics, dimensions, filters }: QueryStructure) =>
  JSON.stringify({
    table,
    metrics: metrics.filter((metric) => !metric.hidden).map(({ fn, column, args }) => [fn, column, args]),
    dimensions: [...dimensions].sort(),
    filters: filters.map((filter) => JSON.stringify(filter, Object.keys(filter).sort())).sort(),
  });

const ALERTABLE = CHART_PRESETS.filter((preset) => preset.name in ALERTABLE_PRESETS).map((preset) => ({
  alert: ALERTABLE_PRESETS[preset.name],
  query: normalizeQuery(preset.query),
  structure: structureKey(preset.queryStructure),
}));

/**
 * What a metric alert created from this chart starts with, or null when the
 * chart is not one of the alertable presets. A chart saved from the builder is
 * matched by its query structure, a seeded or SQL chart by its query text, so
 * an edited preset or a custom query never matches. Stored settings are not
 * checked on read, so an incomplete structure is matched by query text too.
 */
export const chartAlertPreset = (
  chart: Pick<DashboardChart, "name" | "query" | "settings">
): MetricAlertPreset | null => {
  const structure = chart.settings.queryStructure;
  const key = structure && QueryStructureSchema.safeParse(structure).success ? structureKey(structure) : null;
  const query = normalizeQuery(chart.query);
  const match = ALERTABLE.find((preset) => (key ? preset.structure === key : preset.query === query));
  return match ? { name: chart.name, ...match.alert } : null;
};
