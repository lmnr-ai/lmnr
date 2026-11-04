import { DEFAULT_DASHBOARD_NAME } from "@/lib/actions/dashboard/dashboards";
import defaultCharts, { defaultReports } from "@/lib/db/default-charts.ts";
import { type db } from "@/lib/db/drizzle";
import { dashboardCharts, dashboards, projects, reports, workspaces } from "@/lib/db/migrations/schema";

type Database = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Inserts a free-tier workspace with its default reports. Memberships are the caller's job. */
export const insertWorkspace = async (database: Database, name: string): Promise<{ id: string; name: string }> => {
  const [workspace] = await database
    .insert(workspaces)
    .values({ name, tierId: 1 })
    .returning({ id: workspaces.id, name: workspaces.name });

  if (!workspace) {
    throw new Error("Failed to create workspace");
  }

  await database.insert(reports).values(
    defaultReports.map((r) => ({
      workspaceId: workspace.id,
      type: r.type,
      weekdays: r.weekdays,
      hour: r.hour,
    }))
  );

  return workspace;
};

/** Inserts a project with its default dashboard. Tier limits and cache invalidation are the caller's job. */
export const insertProject = async (
  database: Database,
  { name, workspaceId }: { name: string; workspaceId: string }
) => {
  const [project] = await database.insert(projects).values({ name, workspaceId }).returning();

  if (!project) {
    throw new Error("Failed to create project");
  }

  const [dashboard] = await database
    .insert(dashboards)
    .values({ projectId: project.id, name: DEFAULT_DASHBOARD_NAME })
    .returning({ id: dashboards.id });

  await database.insert(dashboardCharts).values(
    defaultCharts.map((chart) => ({
      name: chart.name,
      query: chart.query,
      settings: chart.settings,
      projectId: project.id,
      dashboardId: dashboard.id,
    }))
  );

  return project;
};
