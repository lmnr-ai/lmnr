import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { ChartType } from "@/components/chart-builder/types";
import { type HomeChart } from "@/components/home/types";
import { db } from "@/lib/db/drizzle";
import { dashboardCharts } from "@/lib/db/migrations/schema";

const GetChartsSchema = z.object({
  projectId: z.guid(),
});

const ChartSettingsSchema = z.object({
  config: z.object({
    type: z.enum(ChartType),
    // Table charts have no x/y axes — only line/bar/horizontal-bar require them.
    x: z.string().optional(),
    y: z.string().optional(),
    breakdown: z.string().optional(),
    total: z.boolean().optional(),
    displayMode: z.enum(["total", "average", "none"]).optional(),
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
    id: z.guid(),
    settings: ChartSettingsSchema,
  })
);

const UpdateChartsLayoutSchema = z.object({
  projectId: z.guid(),
  updates: z.array(
    z.object({
      id: z.guid(),
      settings: ChartSettingsSchema,
    })
  ),
});

const DeleteChartSchema = z.object({
  projectId: z.guid(),
  id: z.guid(),
});

const UpdateChartNameSchema = z.object({
  projectId: z.guid(),
  id: z.guid(),
  name: z.string().min(1, "Name is required"),
});

const UpdateChartSchema = z.object({
  projectId: z.guid(),
  id: z.guid(),
  name: z.string().min(1, "Name is required"),
  query: z.string(),
  config: ChartSettingsSchema.shape["config"],
});

const CreateChartSchema = z.object({
  projectId: z.guid(),
  name: z.string().min(1, "Name is required"),
  query: z.string(),
  config: ChartSettingsSchema.shape["config"],
});

export const getCharts = async (input: z.infer<typeof GetChartsSchema>) => {
  const { projectId } = GetChartsSchema.parse(input);

  const charts = await db.select().from(dashboardCharts).where(eq(dashboardCharts.projectId, projectId));

  return charts as HomeChart[];
};

export const getChart = async (input: z.infer<typeof DeleteChartSchema>) => {
  const { projectId, id } = DeleteChartSchema.parse(input);

  const chart = await db.query.dashboardCharts.findFirst({
    where: and(eq(dashboardCharts.projectId, projectId), eq(dashboardCharts.id, id)),
  });

  return chart as HomeChart | undefined;
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

export const deleteHomeChart = async (input: z.infer<typeof DeleteChartSchema>) => {
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
      settings: sql`jsonb_set(settings, '{config}', ${JSON.stringify(config)}::jsonb)`,
    })
    .where(and(eq(dashboardCharts.projectId, projectId), eq(dashboardCharts.id, id)));

  return await getChart({ projectId, id });
};

export const createChart = async (input: z.infer<typeof CreateChartSchema>) => {
  const { name, config, projectId, query } = CreateChartSchema.parse(input);

  const existingCharts = (await db.query.dashboardCharts.findMany({
    where: eq(dashboardCharts.projectId, projectId),
    columns: { settings: true },
  })) as Pick<HomeChart, "settings">[];

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
      settings: {
        config,
        layout: { x: bestSlot.x, y: bestSlot.y, w: chartW, h: 6 },
      },
    })
    .returning();

  return created as HomeChart;
};
