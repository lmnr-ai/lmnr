import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { deleteAllProjectsWorkspaceInfoFromCache } from "@/lib/actions/project";
import defaultCharts from "@/lib/db/default-charts";
import { db } from "@/lib/db/drizzle";
import { dashboardCharts, projects } from "@/lib/db/migrations/schema";
import { type Project } from "@/lib/workspaces/types";

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  workspaceId: z.string(),
});

const populateDefaultDashboardCharts = async (projectId: string): Promise<void> => {
  const chartsToInsert = defaultCharts.map((chart) => ({
    name: chart.name,
    query: chart.query,
    settings: chart.settings,
    projectId: projectId,
  }));

  await db.insert(dashboardCharts).values(chartsToInsert);
};

export async function createProject(input: z.infer<typeof CreateProjectSchema>) {
  const { name, workspaceId } = CreateProjectSchema.parse(input);

  try {
    const [project] = await db
      .insert(projects)
      .values({
        name,
        workspaceId,
      })
      .returning();

    if (!project) {
      throw new Error("Failed to create project");
    }

    await populateDefaultDashboardCharts(project.id);

    return project;
  } finally {
    await deleteAllProjectsWorkspaceInfoFromCache(workspaceId);
  }
}

export const getProjectsByWorkspace = async (workspaceId: string): Promise<Project[]> => {
  const results = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    columns: {
      id: true,
      name: true,
      workspaceId: true,
    },
  });

  return results;
};
