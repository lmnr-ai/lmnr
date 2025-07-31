import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";

import { deleteAllProjectsWorkspaceInfoFromCache } from "@/lib/actions/project";
import { authOptions } from "@/lib/auth";
import defaultCharts from "@/lib/db/default-charts";
import { db } from "@/lib/db/drizzle";
import { dashboardCharts, projects } from "@/lib/db/migrations/schema";
import { isCurrentUserMemberOfWorkspace } from "@/lib/db/utils";

const populateDefaultDashboardCharts = async (projectId: string): Promise<void> => {
  const chartsToInsert = defaultCharts.map((chart) => ({
    name: chart.name,
    query: chart.query,
    settings: chart.settings,
    projectId: projectId,
  }));

  await db.insert(dashboardCharts).values(chartsToInsert);
};

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json();
  try {
    if (!(await isCurrentUserMemberOfWorkspace(body.workspaceId))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const [project] = await db
      .insert(projects)
      .values({
        name: body.name,
        workspaceId: body.workspaceId,
      })
      .returning();

    if (!project) {
      return new Response(JSON.stringify({ error: "Failed to create project" }), { status: 500 });
    }

    await populateDefaultDashboardCharts(project.id);
    return Response.json(project);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await deleteAllProjectsWorkspaceInfoFromCache(body.workspaceId);
  }
}
