import { desc, eq, sql } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { z } from "zod/v4";

import { createProject } from "@/lib/actions/projects";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { apiKeys, membersOfWorkspaces, projects, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";
import { WorkspaceTier, WorkspaceWithProjects } from "@/lib/workspaces/types";

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required"),
  projectName: z.string().optional(),
});

export const createWorkspace = async (input: z.infer<typeof CreateWorkspaceSchema>): Promise<WorkspaceWithProjects> => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const { name, projectName } = CreateWorkspaceSchema.parse(input);

  const userId = await db
    .select({ id: apiKeys.userId })
    .from(apiKeys)
    .where(eq(apiKeys.apiKey, session.user.apiKey))
    .execute()
    .then((res) => {
      if (res.length === 0) {
        throw new Error("User not found");
      }
      return res[0].id;
    });

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name,
      tierId: 1,
    })
    .returning({
      id: workspaces.id,
      name: workspaces.name,
    });

  if (!workspace) {
    throw new Error("Failed to create workspace");
  }

  await db.insert(membersOfWorkspaces).values({
    userId,
    workspaceId: workspace.id,
    memberRole: "owner",
  });

  const projects = projectName
    ? [
      await createProject({
        name: projectName,
        workspaceId: workspace.id,
      }),
    ]
    : [];

  return {
    id: workspace.id,
    name: workspace.name,
    tierName: WorkspaceTier.FREE,
    projects,
  };
};

export const getWorkspaces = async () => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const userId = await db
    .select({ id: apiKeys.userId })
    .from(apiKeys)
    .where(eq(apiKeys.apiKey, session.user.apiKey))
    .execute()
    .then((res) => {
      if (res.length === 0) {
        throw new Error("User not found");
      }
      return res[0].id;
    });

  const results = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      tierName: subscriptionTiers.name,
      isFreeTier: sql`${workspaces.tierId} = 1`,
    })
    .from(workspaces)
    .innerJoin(membersOfWorkspaces, eq(workspaces.id, membersOfWorkspaces.workspaceId))
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(membersOfWorkspaces.userId, userId))
    .orderBy(desc(workspaces.createdAt));

  const workspacesWithProjects = (await Promise.all(
    results.map(async (workspace) => {
      const prjs = await db
        .select({
          id: projects.id,
          name: projects.name,
          workspaceId: projects.workspaceId,
        })
        .from(projects)
        .where(eq(projects.workspaceId, workspace.id));

      return {
        id: workspace.id,
        name: workspace.name,
        tierName: workspace.tierName as WorkspaceTier,
        projects: prjs,
      };
    })
  )) as WorkspaceWithProjects[];

  return workspacesWithProjects;
};
