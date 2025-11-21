import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { ChartType } from "@/components/chart-builder/types";
import { DashboardChart } from "@/components/dashboard/types";
import { repositionCharts } from "@/lib/actions/dashboard/utils";
import { db } from "@/lib/db/drizzle";
import { dashboardCharts } from "@/lib/db/migrations/schema";

const GetChartsSchema = z.object({
  projectId: z.string(),
});

const ChartSettingsSchema = z.object({
  config: z.object({
    type: z.enum(ChartType),
    x: z.string(),
    y: z.string(),
    breakdown: z.string().optional(),
    total: z.boolean().optional(),
  }),
  layout: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
});

export const ChartUpdatesSchema = z.array(
  z.object({
    id: z.string(),
    settings: ChartSettingsSchema,
  })
);

const UpdateChartsLayoutSchema = z.object({
  projectId: z.uuid(),
  updates: z.array(
    z.object({
      id: z.string(),
      settings: ChartSettingsSchema,
    })
  ),
});

const DeleteChartSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

const UpdateChartNameSchema = z.object({
  projectId: z.string(),
  id: z.string(),
  name: z.string().min(1, "Name is required"),
});

const UpdateChartSchema = z.object({
  projectId: z.string(),
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  query: z.string(),
  config: ChartSettingsSchema.shape["config"],
});

const CreateChartSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Name is required"),
  query: z.string(),
  config: ChartSettingsSchema.shape["config"],
});

export const getCharts = async (input: z.infer<typeof GetChartsSchema>) => {
  const { projectId } = GetChartsSchema.parse(input);

  const charts = await db.select().from(dashboardCharts).where(eq(dashboardCharts.projectId, projectId));

  return charts as DashboardChart[];
};

export const getChart = async (input: z.infer<typeof DeleteChartSchema>) => {
  const { projectId, id } = DeleteChartSchema.parse(input);

  const chart = await db.query.dashboardCharts.findFirst({
    where: and(eq(dashboardCharts.projectId, projectId), eq(dashboardCharts.id, id)),
  });

  return chart as DashboardChart | undefined;
};

export const updateChartsLayout = async (input: z.infer<typeof UpdateChartsLayoutSchema>) => {
  const { projectId, updates } = UpdateChartsLayoutSchema.parse(input);

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
    .where(and(eq(dashboardCharts.projectId, projectId), eq(dashboardCharts.id, sql`update_data.id`)));
};

export const deleteDashboardChart = async (input: z.infer<typeof DeleteChartSchema>) => {
  const { id, projectId } = DeleteChartSchema.parse(input);

  await db.delete(dashboardCharts).where(and(eq(dashboardCharts.projectId, projectId), eq(dashboardCharts.id, id)));
};

export const updateChartName = async (input: z.infer<typeof UpdateChartNameSchema>) => {
  const { projectId, name, id } = UpdateChartNameSchema.parse(input);

  await db
    .update(dashboardCharts)
    .set({ name })
    .where(and(eq(dashboardCharts.projectId, projectId), eq(dashboardCharts.id, id)));
};

export const updateChart = async (input: z.infer<typeof UpdateChartSchema>) => {
  const { projectId, id, name, query, config } = UpdateChartSchema.parse(input);

  await db
    .update(dashboardCharts)
    .set({
      name,
      query,
      settings: sql`jsonb_set(settings, '{config}', ${JSON.stringify(config)}::jsonb)`
    })
    .where(and(eq(dashboardCharts.projectId, projectId), eq(dashboardCharts.id, id)));

  return await getChart({ projectId, id });
};

export const createChart = async (input: z.infer<typeof CreateChartSchema>) => {
  const { name, config, projectId, query } = CreateChartSchema.parse(input);

  const newChart = {
    name,
    query,
    projectId,
    settings: {
      config,
      layout: { x: 0, y: 0, w: 4, h: 6 },
    },
  };

  const chartSettings = (await db.query.dashboardCharts.findMany({
    where: eq(dashboardCharts.projectId, projectId),
    columns: {
      id: true,
      settings: true,
    },
  })) as z.infer<typeof ChartUpdatesSchema>;

  const reorderedCharts = repositionCharts(chartSettings);

  const [created] = await db.transaction(async (tx) => {
    const result = await tx.insert(dashboardCharts).values(newChart).returning();
    await updateChartsLayout({ projectId, updates: reorderedCharts });
    return result;
  });

  return created as DashboardChart;
};
