import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { type DashboardChart } from "@/components/dashboards/types";
import { db } from "@/lib/db/drizzle";
import { dashboardCharts, dashboards } from "@/lib/db/migrations/schema";

import { DashboardError } from "./errors";
import { autoPlace, type Layout, LayoutSchema, overlaps, settle, validateLayout } from "./layout";

/**
 * One entry of a chart upsert. With `id` it patches that chart, keeping omitted fields; without
 * `id` it creates one and `name`, `query` and `config` are required. Omitting `layout` keeps an
 * existing chart's position and auto-places a new one. `query` replaces `queryStructure` too: a
 * query without one is SQL-only.
 */
export const ChartUpsertSchema = z.object({
  id: z.guid().nullish(),
  name: z.string().nullish(),
  query: z.string().nullish(),
  queryStructure: z.record(z.string(), z.unknown()).nullish(),
  config: z.record(z.string(), z.unknown()).nullish(),
  layout: LayoutSchema.nullish(),
});

export type ChartUpsert = z.infer<typeof ChartUpsertSchema>;

type StoredChart = Pick<DashboardChart, "id" | "name" | "query"> & { settings: unknown };

/**
 * Writes every entry in one transaction and returns the charts in input order.
 *
 * Explicit layouts are applied exactly and must not overlap each other. Charts not given a
 * layout (the rest of the dashboard and updated entries without one) are pushed down until they
 * clear them; new charts without a layout are auto-placed last.
 */
export const upsertCharts = async (projectId: string, dashboardId: string, charts: ChartUpsert[]) => {
  if (charts.length === 0) throw DashboardError.validation("At least one chart is required");

  return await db.transaction(async (tx) => {
    // Row-locks the dashboard so concurrent chart writes to it place charts one at a time.
    const [locked] = await tx
      .select({ id: dashboards.id })
      .from(dashboards)
      .where(and(eq(dashboards.projectId, projectId), eq(dashboards.id, dashboardId)))
      .for("update");
    if (!locked) throw DashboardError.notFound("Dashboard");

    const inDashboard = and(eq(dashboardCharts.projectId, projectId), eq(dashboardCharts.dashboardId, dashboardId));
    const existing = (await tx.select().from(dashboardCharts).where(inDashboard)) as StoredChart[];
    const existingById = new Map(existing.map((chart) => [chart.id, chart]));

    validateUpserts(charts, existingById);
    const { entries, moved } = resolveLayouts(charts, existing);

    const batchIds = new Set(charts.flatMap((chart) => (chart.id ? [chart.id] : [])));
    for (const [id, layout] of moved) {
      if (batchIds.has(id)) continue;
      await tx
        .update(dashboardCharts)
        .set({ settings: sql`jsonb_set(${dashboardCharts.settings}, '{layout}', ${JSON.stringify(layout)}::jsonb)` })
        .where(and(inDashboard, eq(dashboardCharts.id, id)));
    }

    const written: DashboardChart[] = [];
    for (const [i, upsert] of charts.entries()) {
      const layout = entries[i];
      const current = upsert.id ? existingById.get(upsert.id) : undefined;

      if (current) {
        const [chart] = await tx
          .update(dashboardCharts)
          .set({
            name: upsert.name?.trim() ?? current.name,
            query: upsert.query ?? current.query,
            settings: mergeSettings(current.settings, upsert, layout),
          })
          .where(and(inDashboard, eq(dashboardCharts.id, current.id)))
          .returning();
        if (!chart) throw DashboardError.notFound(`Chart ${current.id}`);
        written.push(chart as DashboardChart);
      } else {
        const [chart] = await tx
          .insert(dashboardCharts)
          .values({
            projectId,
            dashboardId,
            name: (upsert.name ?? "").trim(),
            query: upsert.query ?? "",
            settings: { config: upsert.config ?? null, layout, queryStructure: upsert.queryStructure ?? null },
          })
          .returning();
        written.push(chart as DashboardChart);
      }
    }

    return written;
  });
};

const validateUpserts = (charts: ChartUpsert[], existingById: Map<string, StoredChart>) => {
  const seen = new Set<string>();
  for (const [i, chart] of charts.entries()) {
    const invalid = (msg: string) => DashboardError.validation(`charts[${i}]: ${msg}`);
    if (chart.id) {
      if (seen.has(chart.id)) throw invalid("chart id appears more than once in the batch");
      seen.add(chart.id);
      if (!existingById.has(chart.id)) throw DashboardError.notFound(`Chart ${chart.id} on this dashboard`);
    } else if (chart.name == null || chart.query == null || chart.config == null) {
      throw invalid("a new chart needs name, query and config");
    }
    if (chart.name != null && chart.name.trim() === "") throw invalid("name must not be blank");
    if (chart.queryStructure != null && chart.query == null) {
      throw invalid("queryStructure must come with the query it generates");
    }
    const layoutError = chart.layout ? validateLayout(chart.layout) : undefined;
    if (layoutError) throw invalid(`layout: ${layoutError}`);
  }
};

const storedLayout = (settings: unknown): Layout | undefined =>
  LayoutSchema.safeParse((settings as { layout?: unknown } | null)?.layout).data;

const sameLayout = (a: Layout | undefined, b: Layout) => a?.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** `entries`: the final layout of each upsert, in input order. `moved`: existing charts that had to move. */
export const resolveLayouts = (charts: ChartUpsert[], existing: StoredChart[]) => {
  const explicit = charts.flatMap((chart, i): Array<[number, Layout]> => (chart.layout ? [[i, chart.layout]] : []));
  for (const [n, [i, a]] of explicit.entries()) {
    const clash = explicit.slice(n + 1).find(([, b]) => overlaps(a, b));
    if (clash) throw DashboardError.validation(`charts[${i}] and charts[${clash[0]}] have overlapping layouts`);
  }

  const explicitIds = new Set(charts.flatMap((chart) => (chart.layout && chart.id ? [chart.id] : [])));
  const others = existing.flatMap((chart): Array<[string, Layout]> => {
    const layout = storedLayout(chart.settings);
    return !explicitIds.has(chart.id) && layout ? [[chart.id, layout]] : [];
  });
  const original = new Map(others);

  const fixed = explicit.map(([, layout]) => layout);
  const settled = new Map(settle(fixed, others));

  const placed = [...fixed, ...settled.values()];
  const entries = charts.map((chart) => {
    const kept = chart.layout ?? (chart.id ? settled.get(chart.id) : undefined);
    if (kept) return kept;
    const layout = autoPlace(placed);
    placed.push(layout);
    return layout;
  });

  const moved = new Map([...settled].filter(([id, layout]) => !sameLayout(original.get(id), layout)));

  return { entries, moved };
};

/** Patches the stored settings so fields the upsert leaves out survive. */
export const mergeSettings = (current: unknown, upsert: ChartUpsert, layout: Layout) => {
  const settings: Record<string, unknown> =
    current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
  settings.layout = layout;
  if (upsert.config != null) settings.config = upsert.config;
  if (upsert.query != null) settings.queryStructure = upsert.queryStructure ?? null;
  return settings;
};
