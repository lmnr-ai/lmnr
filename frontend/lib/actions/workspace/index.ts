import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { stripe } from "@/lib/actions/checkout/stripe.ts";
import { deleteProject } from "@/lib/actions/project";
import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { getServerSession } from "@/lib/auth-session";
import {
  cache,
  PROJECT_MEMBER_CACHE_KEY,
  WORKSPACE_MEMBER_CACHE_KEY,
} from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import {
  membersOfWorkspaces,
  projects,
  subscriptionTiers,
  users,
  workspaceAddons,
  workspaces,
} from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { type Workspace, type WorkspaceTier, type WorkspaceUser } from "@/lib/workspaces/types";

const DeleteWorkspaceSchema = z.object({
  workspaceId: z.guid(),
});

const UpdateWorkspaceSchema = z.object({
  workspaceId: z.guid(),
  name: z.string().min(1, { error: "Workspace name is required" }),
});

const GetWorkspaceSchema = z.object({
  workspaceId: z.guid(),
});

const GetWorkspaceUsersSchema = z.object({
  workspaceId: z.guid(),
});

const UpdateRoleSchema = z.object({
  workspaceId: z.guid(),
  userId: z.guid(),
  role: z.enum(["member", "admin"]),
});

const RemoveUserSchema = z.object({
  workspaceId: z.guid(),
  userId: z.guid(),
});

export async function updateWorkspace(input: z.infer<typeof UpdateWorkspaceSchema>) {
  const { workspaceId, name } = UpdateWorkspaceSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner"] });

  const result = await db.update(workspaces).set({ name }).where(eq(workspaces.id, workspaceId));

  if (result.count === 0) {
    throw new Error("Workspace not found");
  }

  return { success: true, message: "Workspace renamed successfully" };
}

export async function deleteWorkspace(input: z.infer<typeof DeleteWorkspaceSchema>) {
  const { workspaceId } = DeleteWorkspaceSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner"] });

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { id: true, subscriptionId: true },
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  if (workspace.subscriptionId) {
    const s = stripe();
    await s.subscriptions
      .cancel(workspace.subscriptionId)
      .catch((e) => console.error("Failed to cancel subscription", e));
  }

  const projectsInWorkspace = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    columns: {
      id: true,
    },
  });

  await Promise.all(
    projectsInWorkspace.map(async (project) => {
      await deleteProject({ projectId: project.id });
    })
  );

  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));

  return { success: true, message: "Workspace deleted successfully" };
}

export const getWorkspace = async (input: z.infer<typeof GetWorkspaceSchema>): Promise<Workspace> => {
  const { workspaceId } = GetWorkspaceSchema.parse(input);

  const workspace = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      tierName: subscriptionTiers.name,
    })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (workspace.length === 0) {
    throw new Error("Workspace not found");
  }

  let addons: string[] = [];

  if (isFeatureEnabled(Feature.SUBSCRIPTION)) {
    const addonDefinitions = await db
      .select({ addonSlug: workspaceAddons.addonSlug })
      .from(workspaceAddons)
      .where(eq(workspaceAddons.workspaceId, workspaceId));

    addons = addonDefinitions.map((a) => a.addonSlug);
  }

  return {
    id: workspace[0].id,
    name: workspace[0].name,
    tierName: workspace[0].tierName as WorkspaceTier,
    addons,
  };
};

export const getWorkspaceUsers = async (input: z.infer<typeof GetWorkspaceUsersSchema>): Promise<WorkspaceUser[]> => {
  const { workspaceId } = GetWorkspaceUsersSchema.parse(input);

  const workspaceUsers = (await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: membersOfWorkspaces.memberRole,
      createdAt: membersOfWorkspaces.createdAt,
    })
    .from(users)
    .innerJoin(membersOfWorkspaces, eq(users.id, membersOfWorkspaces.userId))
    .where(eq(membersOfWorkspaces.workspaceId, workspaceId))) as WorkspaceUser[];

  return workspaceUsers;
};

export const getWorkspaceInfo = async (workspaceId: string): Promise<Workspace> => {
  const [workspace] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      tierName: subscriptionTiers.name,
    })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  let addons: string[] = [];

  if (isFeatureEnabled(Feature.SUBSCRIPTION)) {
    const addonDefinitions = await db
      .select({ addonSlug: workspaceAddons.addonSlug })
      .from(workspaceAddons)
      .where(eq(workspaceAddons.workspaceId, workspaceId));

    addons = addonDefinitions.map((a) => a.addonSlug);
  }

  return {
    ...workspace,
    tierName: workspace.tierName as WorkspaceTier,
    addons,
  };
};

export { getWorkspaceUsage } from "./usage-summary";

export const updateRole = async (input: z.infer<typeof UpdateRoleSchema>) => {
  const { workspaceId, userId, role } = UpdateRoleSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });

  const [targetUser] = await db
    .select({ memberRole: membersOfWorkspaces.memberRole })
    .from(membersOfWorkspaces)
    .where(and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, userId)));

  if (!targetUser) {
    throw new Error("User not found in workspace");
  }

  if (targetUser.memberRole === "owner") {
    throw new Error("Cannot change owner role");
  }

  await db
    .update(membersOfWorkspaces)
    .set({ memberRole: role })
    .where(and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, userId)));

  return { success: true, message: "User role updated successfully" };
};

export const TransferOwnershipSchema = z.object({
  workspaceId: z.guid(),
  currentOwnerId: z.guid(),
  newOwnerId: z.guid(),
});

export async function transferOwnership(input: z.infer<typeof TransferOwnershipSchema>) {
  const { workspaceId, newOwnerId, currentOwnerId } = TransferOwnershipSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner"] });

  const newOwner = await db.query.membersOfWorkspaces.findFirst({
    where: and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, newOwnerId)),
  });

  if (!newOwner) {
    throw new Error("New owner not found in workspace");
  }

  if (newOwner.memberRole !== "admin") {
    throw new Error("New owner must be an admin");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(membersOfWorkspaces)
      .set({ memberRole: "admin" })
      .where(and(eq(membersOfWorkspaces.userId, currentOwnerId), eq(membersOfWorkspaces.workspaceId, workspaceId)));

    await tx
      .update(membersOfWorkspaces)
      .set({ memberRole: "owner" })
      .where(and(eq(membersOfWorkspaces.userId, newOwnerId), eq(membersOfWorkspaces.workspaceId, workspaceId)));
  });

  return { success: true };
}

export async function removeUserFromWorkspace(input: z.infer<typeof RemoveUserSchema>) {
  const { workspaceId, userId } = RemoveUserSchema.parse(input);

  const session = await getServerSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const authenticatedUserId = session.user.id;

  if (authenticatedUserId !== userId) {
    await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });
  }

  await db
    .delete(membersOfWorkspaces)
    .where(and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, userId)));

  try {
    await cache.remove(WORKSPACE_MEMBER_CACHE_KEY(workspaceId, userId));

    const workspaceProjects = await db.query.projects.findMany({
      where: eq(projects.workspaceId, workspaceId),
      columns: { id: true },
    });

    await Promise.all(workspaceProjects.map((project) => cache.remove(PROJECT_MEMBER_CACHE_KEY(project.id, userId))));
  } catch (e) {
    console.error("Error clearing cache after user removal", e);
  }

  return { success: true };
}
