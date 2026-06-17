import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { deleteAllProjectsWorkspaceInfoFromCache } from "@/lib/actions/project";
import defaultCharts from "@/lib/db/default-charts.ts";
import { db } from "@/lib/db/drizzle";
import { dashboardCharts, projects, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { type Project } from "@/lib/workspaces/types";

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  workspaceId: z.guid(),
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

      if (isFeatureEnabled(Feature.SUBSCRIPTION) && workspace?.tierName.trim().toLowerCase() === "free") {
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
    // Deterministic default-project pick: matches /projects' desc(createdAt) fallback so
    // every settings entry point lands on the same project when no last-project cookie exists.
    orderBy: desc(projects.createdAt),
  });

  return results;
};

// The workspace's newest project, or undefined when it has none. Single source for the
// "default project of a workspace" pick — server entry points that only know a workspaceId
// (Stripe return URLs, Slack callbacks, invite accept, /projects) all resolve through this so
// the ordering tiebreak can't drift between them.
export const getNewestProjectId = async (workspaceId: string): Promise<string | undefined> => {
  const project = await db.query.projects.findFirst({
    where: eq(projects.workspaceId, workspaceId),
    columns: { id: true },
    orderBy: desc(projects.createdAt),
  });
  return project?.id;
};

// Settings live at /project/[projectId]/settings — there is no workspace-scoped route. A workspace
// with no project has no settings surface, so we fall back to /projects. Caveat: /projects resolves
// its target workspace from cookies/membership, NOT this workspaceId, so a deep link for a
// project-less workspace can land on a different workspace. Accepted because every real caller
// (billing / Slack / checkout / usage + report emails) targets a workspace that already has ≥1
// project — a project-less workspace can't have generated any of those links.
export const getWorkspaceSettingsPath = async (workspaceId: string, section?: string): Promise<string> => {
  const projectId = await getNewestProjectId(workspaceId);
  if (!projectId) return "/projects";
  return section ? `/project/${projectId}/settings?tab=${section}` : `/project/${projectId}/settings`;
};
