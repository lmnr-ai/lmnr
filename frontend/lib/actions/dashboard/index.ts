import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { ChartType } from "@/components/chart-builder/types";
import { type DashboardChart, GRID_COLS } from "@/components/dashboards/types";
import { QueryStructureSchema } from "@/lib/actions/sql/types";
import { callAppServer } from "@/lib/app-server";
import { db } from "@/lib/db/drizzle";
import { dashboardCharts, dashboards } from "@/lib/db/migrations/schema";

const GetChartsSchema = z.object({
  projectId: z.guid(),
  dashboardId: z.guid(),
});

const ChartSettingsSchema = z.object({
  config: z.object({
    type: z.enum(ChartType),
    x: z.string().optional(),
    y: z.string().optional(),
    breakdown: z.string().optional(),
    total: z.boolean().optional(),
    displayMode: z.enum(["total", "average", "none"]).optional(),
    tableColumnConfig: z
      .object({
        columnOrder: z.array(z.string()).optional(),
        columnSizing: z.record(z.string(), z.number()).optional(),
        columnVisibility: z.record(z.string(), z.boolean()).optional(),
      })
      .optional(),
  }),
  layout: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  queryStructure: QueryStructureSchema.optional().nullable(),
});

export const ChartUpdatesSchema = z.array(
  z.object({
    id: z.guid(),
    settings: ChartSettingsSchema,
  })
);

const UpdateChartsLayoutSchema = z.object({
  projectId: z.guid(),
  dashboardId: z.guid(),
  updates: z.array(
    z.object({
      id: z.guid(),
      settings: ChartSettingsSchema,
    })
  ),
});

const ChartSchema = z.object({
  projectId: z.guid(),
  dashboardId: z.guid(),
  id: z.guid(),
});

const UpdateChartNameSchema = z.object({
  projectId: z.guid(),
  dashboardId: z.guid(),
  id: z.guid(),
  name: z.string().min(1, "Name is required"),
});

const UpdateChartSchema = z.object({
  projectId: z.guid(),
  dashboardId: z.guid(),
  id: z.guid(),
  name: z.string().min(1, "Name is required"),
  query: z.string(),
  config: ChartSettingsSchema.shape["config"],
  queryStructure: QueryStructureSchema.optional().nullable(),
});

const CreateChartSchema = z.object({
  projectId: z.guid(),
  dashboardId: z.guid(),
  name: z.string().min(1, "Name is required"),
  query: z.string(),
  config: ChartSettingsSchema.shape["config"],
  queryStructure: QueryStructureSchema.optional().nullable(),
});

const MoveChartSchema = ChartSchema.extend({
  targetDashboardId: z.guid(),
});

const inDashboard = (projectId: string, dashboardId: string) =>
  and(eq(dashboardCharts.projectId, projectId), eq(dashboardCharts.dashboardId, dashboardId));

const chartScope = ({ projectId, dashboardId, id }: z.infer<typeof ChartSchema>) =>
  and(inDashboard(projectId, dashboardId), eq(dashboardCharts.id, id));

export const getCharts = async (input: z.infer<typeof GetChartsSchema>) => {
  const { projectId, dashboardId } = GetChartsSchema.parse(input);

  const charts = await db.select().from(dashboardCharts).where(inDashboard(projectId, dashboardId));

  return charts as DashboardChart[];
};

export const getChart = async (input: z.infer<typeof ChartSchema>) => {
  const scope = ChartSchema.parse(input);

  const chart = await db.query.dashboardCharts.findFirst({ where: chartScope(scope) });

  return chart as DashboardChart | undefined;
};

// Resolves pre-multi-dashboard editor links (`/dashboards/<chartId>`), which
// carry no dashboard id.
export const findChartDashboardId = async (input: { projectId: string; id: string }) => {
  const parsed = z.object({ projectId: z.guid(), id: z.guid() }).safeParse(input);

  if (!parsed.success) return undefined;

  const chart = await db.query.dashboardCharts.findFirst({
    where: and(eq(dashboardCharts.projectId, parsed.data.projectId), eq(dashboardCharts.id, parsed.data.id)),
    columns: { dashboardId: true },
  });

  return chart?.dashboardId;
};

export const updateChartsLayout = async (input: z.infer<typeof UpdateChartsLayoutSchema>) => {
  const { projectId, dashboardId, updates } = UpdateChartsLayoutSchema.parse(input);

  if (updates.length === 0) return;

  const values = sql.join(
    updates.map(({ id, settings }) => sql`(${id}::uuid, ${JSON.stringify(settings)}::jsonb)`),
    sql`, `
  );

  await db
    .update(dashboardCharts)
    .set({
      settings: sql`update_data.settings`,
    })
    .from(sql`(VALUES ${values}) AS update_data(id, settings)`)
    .where(and(inDashboard(projectId, dashboardId), eq(dashboardCharts.id, sql`update_data.id`)));
};

// Chart writes go through app-server's upsert, shared with the Laminar agent: it places new
// charts and keeps each chart's stored layout when only its name or query changes.
const upsertChart = async (projectId: string, dashboardId: string, chart: Record<string, unknown>) => {
  const [saved] = await callAppServer<DashboardChart[]>(`/projects/${projectId}/dashboards/${dashboardId}/charts`, {
    method: "PUT",
    body: { charts: [chart] },
  });

  return saved;
};

export const deleteDashboardChart = async (input: z.infer<typeof ChartSchema>) => {
  const { projectId, dashboardId, id } = ChartSchema.parse(input);

  await callAppServer(`/projects/${projectId}/dashboards/${dashboardId}/charts/${id}`, { method: "DELETE" });
};

export const updateChartName = async (input: z.infer<typeof UpdateChartNameSchema>) => {
  const { projectId, dashboardId, id, name } = UpdateChartNameSchema.parse(input);

  await upsertChart(projectId, dashboardId, { id, name });
};

export const updateChart = async (input: z.infer<typeof UpdateChartSchema>) => {
  const { projectId, dashboardId, id, name, query, config, queryStructure } = UpdateChartSchema.parse(input);

  return await upsertChart(projectId, dashboardId, { id, name, query, config, queryStructure });
};

type ChartLayout = DashboardChart["settings"]["layout"];

const overlaps = (a: ChartLayout, b: ChartLayout) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Where a duplicate of `source` goes. Charts occupying the slot are pushed below
// it by the caller, so the slot must satisfy an extra condition beyond being
// adjacent: nothing overlapping it may START above its top edge. Otherwise that
// chart both survives the shift (a taller neighbour still intersects the slot)
// and leaves a hole above it that react-grid-layout's compaction fills by
// floating the copy up, away from the source.
//
// Beside the source qualifies when its overlappers all start at or below it;
// directly below always qualifies, since the source itself covers those columns
// in the rows immediately above.
export const resolveDuplicateLayout = (source: ChartLayout, others: ChartLayout[]): ChartLayout => {
  const { x, y, w, h } = source;
  const beside = { x: x + w, y, w, h };

  if (x + 2 * w <= GRID_COLS && others.filter((o) => overlaps(o, beside)).every((o) => o.y >= beside.y)) {
    return beside;
  }

  return { x, y: y + h, w, h };
};

export const duplicateChart = async (input: z.infer<typeof ChartSchema>) => {
  const { projectId, dashboardId, id } = ChartSchema.parse(input);

  const source = await getChart({ projectId, dashboardId, id });

  if (!source) return undefined;

  const siblings = (await db.query.dashboardCharts.findMany({
    where: inDashboard(projectId, dashboardId),
  })) as DashboardChart[];

  const others = siblings.filter((chart) => chart.id !== id).map((chart) => chart.settings.layout);
  const layout = resolveDuplicateLayout(source.settings.layout, others);

  // Whatever sits in the chosen slot is pushed below it, otherwise
  // react-grid-layout would resolve the collision by bumping the copy itself
  // away from its source and then persist that position through its own layout
  // PATCH. It compacts the resulting gaps on render.
  const displaced = siblings
    .filter((chart) => chart.id !== id && overlaps(chart.settings.layout, layout))
    .map((chart) => ({
      id: chart.id,
      settings: { ...chart.settings, layout: { ...chart.settings.layout, y: layout.y + layout.h } },
    }));

  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(dashboardCharts)
      .values({
        name: `${source.name} (copy)`,
        query: source.query,
        projectId,
        dashboardId,
        settings: {
          config: source.settings.config,
          layout,
          queryStructure: source.settings.queryStructure ?? null,
        },
      })
      .returning();

    for (const { id: displacedId, settings } of displaced) {
      await tx
        .update(dashboardCharts)
        .set({ settings })
        .where(chartScope({ projectId, dashboardId, id: displacedId }));
    }

    return inserted;
  });

  return created as DashboardChart;
};

export const createChart = async (input: z.infer<typeof CreateChartSchema>) => {
  const { projectId, dashboardId, name, query, config, queryStructure } = CreateChartSchema.parse(input);

  return await upsertChart(projectId, dashboardId, { name, query, config, queryStructure });
};

// Appends the chart below everything on the target dashboard, keeping its size.
export const moveChart = async (input: z.infer<typeof MoveChartSchema>) => {
  const { projectId, dashboardId, id, targetDashboardId } = MoveChartSchema.parse(input);

  const source = await getChart({ projectId, dashboardId, id });
  const target = await db.query.dashboards.findFirst({
    where: and(eq(dashboards.projectId, projectId), eq(dashboards.id, targetDashboardId)),
    columns: { id: true },
  });

  if (!source || !target) return undefined;

  const targetCharts = await getCharts({ projectId, dashboardId: targetDashboardId });
  const bottom = Math.max(0, ...targetCharts.map(({ settings: { layout } }) => layout.y + layout.h));
  const settings = { ...source.settings, layout: { ...source.settings.layout, x: 0, y: bottom } };

  const [moved] = await db
    .update(dashboardCharts)
    .set({ dashboardId: targetDashboardId, settings })
    .where(chartScope({ projectId, dashboardId, id }))
    .returning();

  return moved as DashboardChart | undefined;
};
