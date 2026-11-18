import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import mcpCharts, { MCP_DASHBOARD_NAME } from "@/lib/db/mcp-charts";
import { dashboardCharts, dashboards, projects } from "@/lib/db/migrations/schema";

import { DEFAULT_DASHBOARD_NAME } from "./dashboards";
import { DashboardError } from "./errors";

const ProjectSchema = z.object({
  projectId: z.guid(),
});

/**
 * Creates the project's "MCP" dashboard the first time app-server ingests an MCP request for it.
 * `projects.mcp_dashboard_created_at` makes it once per project: a dashboard the user deleted or
 * renamed is not brought back. Takes the dashboards lock `getOrCreateDefaultDashboard` takes.
 */
export const ensureMcpDashboard = async (input: z.infer<typeof ProjectSchema>) => {
  const { projectId } = ProjectSchema.parse(input);

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`dashboards:${projectId}`}))`);

    const project = await tx.query.projects.findFirst({
      columns: { mcpDashboardCreatedAt: true },
      where: eq(projects.id, projectId),
    });
    if (!project) throw DashboardError.notFound("Project");
    if (project.mcpDashboardCreatedAt) return { created: false };

    // The oldest dashboard is the landing one, so a project without any gets "main" first.
    const existing = await tx.query.dashboards.findFirst({
      columns: { id: true },
      where: eq(dashboards.projectId, projectId),
    });
    if (!existing) {
      await tx.insert(dashboards).values({ projectId, name: DEFAULT_DASHBOARD_NAME });
    }

    // `now()` is the transaction start, so a "main" created above would tie with it.
    const [dashboard] = await tx
      .insert(dashboards)
      .values({ projectId, name: MCP_DASHBOARD_NAME, createdAt: sql`clock_timestamp()` })
      .returning({ id: dashboards.id });

    await tx.insert(dashboardCharts).values(
      mcpCharts.map((chart) => ({
        name: chart.name,
        query: chart.query,
        settings: chart.settings,
        projectId,
        dashboardId: dashboard.id,
      }))
    );

    await tx
      .update(projects)
      .set({ mcpDashboardCreatedAt: sql`now()` })
      .where(eq(projects.id, projectId));

    return { created: true, dashboardId: dashboard.id };
  });
};
