import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { ChartType } from "@/components/chart-builder/types";
import { type DashboardChart, GRID_COLS } from "@/components/dashboards/types";
import { QueryStructureSchema } from "@/lib/actions/sql/types";
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

const assertDashboardInProject = async (projectId: string, dashboardId: string) => {
  const dashboard = await db.query.dashboards.findFirst({
    where: and(eq(dashboards.projectId, projectId), eq(dashboards.id, dashboardId)),
    columns: { id: true },
  });

  if (!dashboard) {
    throw new Error("Dashboard not found");
  }
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

export const deleteDashboardChart = async (input: z.infer<typeof ChartSchema>) => {
  const scope = ChartSchema.parse(input);

  await db.delete(dashboardCharts).where(chartScope(scope));
};

export const updateChartName = async (input: z.infer<typeof UpdateChartNameSchema>) => {
  const { name, ...scope } = UpdateChartNameSchema.parse(input);

  await db.update(dashboardCharts).set({ name }).where(chartScope(scope));
};

export const updateChart = async (input: z.infer<typeof UpdateChartSchema>) => {
  const { name, query, config, queryStructure, ...scope } = UpdateChartSchema.parse(input);

  // Patch config and queryStructure on the existing settings jsonb without
  // clobbering layout. Nested jsonb_set: inner call replaces {config},
  // outer replaces {queryStructure}.
  const settingsUpdate = sql`jsonb_set(
    jsonb_set(settings, '{config}', ${JSON.stringify(config)}::jsonb),
    '{queryStructure}',
    ${JSON.stringify(queryStructure ?? null)}::jsonb
  )`;

  await db
    .update(dashboardCharts)
    .set({
      name,
      query,
      settings: settingsUpdate,
    })
    .where(chartScope(scope));

  return await getChart(scope);
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
  const { name, config, projectId, dashboardId, query, queryStructure } = CreateChartSchema.parse(input);

  await assertDashboardInProject(projectId, dashboardId);

  const existingCharts = (await db.query.dashboardCharts.findMany({
    where: inDashboard(projectId, dashboardId),
    columns: { settings: true },
  })) as Pick<DashboardChart, "settings">[];

  const chartW = 4;
  const slots = [0, 4, 8];
  const slotHeights = slots.map((slotX) => {
    const bottom = existingCharts.reduce((max, chart) => {
      const { x, y, w, h } = chart.settings.layout;
      // Check if this chart overlaps the slot's columns
      if (x < slotX + chartW && x + w > slotX) {
        return Math.max(max, y + h);
      }
      return max;
    }, 0);
    return { x: slotX, y: bottom };
  });

  const bestSlot = slotHeights.reduce((best, slot) => (slot.y < best.y ? slot : best));

  const [created] = await db
    .insert(dashboardCharts)
    .values({
      name,
      query,
      projectId,
      dashboardId,
      settings: {
        config,
        layout: { x: bestSlot.x, y: bestSlot.y, w: chartW, h: 6 },
        queryStructure: queryStructure ?? null,
      },
    })
    .returning();

  return created as DashboardChart;
};
