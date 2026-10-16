import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { type Dashboard } from "@/components/dashboards/types";
import { db } from "@/lib/db/drizzle";
import { dashboardCharts, dashboards } from "@/lib/db/migrations/schema";

export const DEFAULT_DASHBOARD_NAME = "main";

export class LastDashboardError extends Error {
  constructor() {
    super("A project must have at least one dashboard");
  }
}

const ProjectSchema = z.object({
  projectId: z.guid(),
});

const DashboardSchema = z.object({
  projectId: z.guid(),
  dashboardId: z.guid(),
});

const DefaultDashboardSchema = ProjectSchema.extend({
  preferredId: z.string().optional(),
});

const CreateDashboardSchema = z.object({
  projectId: z.guid(),
  name: z.string().trim().min(1, "Name is required"),
});

const RenameDashboardSchema = DashboardSchema.extend({
  name: z.string().trim().min(1, "Name is required"),
});

export const getDashboards = async (input: z.infer<typeof ProjectSchema>) => {
  const { projectId } = ProjectSchema.parse(input);

  const rows = await db
    .select({
      id: dashboards.id,
      name: dashboards.name,
      createdAt: dashboards.createdAt,
      chartCount: count(dashboardCharts.id),
    })
    .from(dashboards)
    .leftJoin(dashboardCharts, eq(dashboardCharts.dashboardId, dashboards.id))
    .where(eq(dashboards.projectId, projectId))
    .groupBy(dashboards.id)
    .orderBy(asc(dashboards.createdAt), asc(dashboards.id));

  return rows as Dashboard[];
};

export const getDashboard = async (input: z.infer<typeof DashboardSchema>) => {
  const parsed = DashboardSchema.safeParse(input);

  // Legacy chart-editor URLs (`/dashboards/new`) land here with a non-uuid id.
  if (!parsed.success) return undefined;

  const { projectId, dashboardId } = parsed.data;

  const dashboard = await db.query.dashboards.findFirst({
    where: and(eq(dashboards.projectId, projectId), eq(dashboards.id, dashboardId)),
  });

  return dashboard as Omit<Dashboard, "chartCount"> | undefined;
};

// The oldest dashboard is the project's landing one, unless `preferredId` (e.g. the
// last-visited one) still exists. Projects without any get one on first visit; the
// advisory lock stops two concurrent visits from each creating a default.
export const getOrCreateDefaultDashboard = async (input: z.infer<typeof DefaultDashboardSchema>) => {
  const { projectId, preferredId } = DefaultDashboardSchema.parse(input);

  if (preferredId) {
    const preferred = await getDashboard({ projectId, dashboardId: preferredId });
    if (preferred) return preferred;
  }

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`dashboards:${projectId}`}))`);

    const existing = await tx.query.dashboards.findFirst({
      where: eq(dashboards.projectId, projectId),
      orderBy: [asc(dashboards.createdAt), asc(dashboards.id)],
    });

    if (existing) return existing;

    const [created] = await tx.insert(dashboards).values({ projectId, name: DEFAULT_DASHBOARD_NAME }).returning();

    return created;
  });
};

export const createDashboard = async (input: z.infer<typeof CreateDashboardSchema>) => {
  const { projectId, name } = CreateDashboardSchema.parse(input);

  const [created] = await db.insert(dashboards).values({ projectId, name }).returning();

  return created;
};

export const renameDashboard = async (input: z.infer<typeof RenameDashboardSchema>) => {
  const { projectId, dashboardId, name } = RenameDashboardSchema.parse(input);

  const [updated] = await db
    .update(dashboards)
    .set({ name })
    .where(and(eq(dashboards.projectId, projectId), eq(dashboards.id, dashboardId)))
    .returning();

  return updated;
};

export const deleteDashboard = async (input: z.infer<typeof DashboardSchema>) => {
  const { projectId, dashboardId } = DashboardSchema.parse(input);

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`dashboards:${projectId}`}))`);

    const [{ total }] = await tx.select({ total: count() }).from(dashboards).where(eq(dashboards.projectId, projectId));

    if (total <= 1) {
      throw new LastDashboardError();
    }

    // Charts are removed by the dashboard_id ON DELETE CASCADE.
    await tx.delete(dashboards).where(and(eq(dashboards.projectId, projectId), eq(dashboards.id, dashboardId)));
  });
};
