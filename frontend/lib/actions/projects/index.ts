import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { deleteAllProjectsWorkspaceInfoFromCache } from "@/lib/actions/project";
import defaultCharts from "@/lib/db/default-charts";
import { db } from "@/lib/db/drizzle";
import { dashboardCharts, projects, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { type Project } from "@/lib/workspaces/types";

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  workspaceId: z.string(),
});

export async function createProject(input: z.infer<typeof CreateProjectSchema>) {
  const { name, workspaceId } = CreateProjectSchema.parse(input);

  try {
    return await db.transaction(async (tx) => {
      const [workspace] = await tx
        .select({ tierName: subscriptionTiers.name })
        .from(workspaces)
        .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
        .where(eq(workspaces.id, workspaceId))
        .limit(1)
        .for("update");

      if (isFeatureEnabled(Feature.CLOUD) && workspace?.tierName.trim().toLowerCase() === "free") {
        const existingProjects = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.workspaceId, workspaceId));

        if (existingProjects.length >= 1) {
          throw new Error("Free plan is limited to 1 project per workspace. Please upgrade to create more projects.");
        }
      }

      const [newProject] = await tx
        .insert(projects)
        .values({
          name,
          workspaceId,
        })
        .returning();

      if (!newProject) {
        throw new Error("Failed to create project");
      }

      const chartsToInsert = defaultCharts.map((chart) => ({
        name: chart.name,
        query: chart.query,
        settings: chart.settings,
        projectId: newProject.id,
      }));

      await tx.insert(dashboardCharts).values(chartsToInsert);

      return newProject;
    });
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
