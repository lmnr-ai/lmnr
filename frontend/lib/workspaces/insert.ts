import { sql } from "drizzle-orm";

import { DEFAULT_DASHBOARD_NAME } from "@/lib/actions/dashboard/dashboards";
import defaultCharts, { defaultReports } from "@/lib/db/default-charts.ts";
import { type db } from "@/lib/db/drizzle";
import mcpCharts, { MCP_DASHBOARD_NAME } from "@/lib/db/mcp-charts";
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

/**
 * Inserts a project with its default "main" and "MCP" dashboards. Tier limits and cache invalidation
 * are the caller's job.
 */
export const insertProject = async (
  database: Database,
  { name, workspaceId }: { name: string; workspaceId: string }
) => {
  const [project] = await database.insert(projects).values({ name, workspaceId }).returning();

  if (!project) {
    throw new Error("Failed to create project");
  }

  const [main] = await database
    .insert(dashboards)
    .values({ projectId: project.id, name: DEFAULT_DASHBOARD_NAME })
    .returning({ id: dashboards.id });

  // The oldest dashboard is the landing one, and `now()` is the transaction start, so a plain
  // default would tie with "main".
  const [mcp] = await database
    .insert(dashboards)
    .values({
      projectId: project.id,
      name: MCP_DASHBOARD_NAME,
      createdAt: sql`(SELECT GREATEST(clock_timestamp(), ${dashboards.createdAt} + interval '1 microsecond') FROM ${dashboards} WHERE ${dashboards.id} = ${main.id})`,
    })
    .returning({ id: dashboards.id });

  const charts = [
    ...defaultCharts.map((chart) => ({ chart, dashboardId: main.id })),
    ...mcpCharts.map((chart) => ({ chart, dashboardId: mcp.id })),
  ];
  await database.insert(dashboardCharts).values(
    charts.map(({ chart, dashboardId }) => ({
      name: chart.name,
      query: chart.query,
      settings: chart.settings,
      projectId: project.id,
      dashboardId,
    }))
  );

  return project;
};
