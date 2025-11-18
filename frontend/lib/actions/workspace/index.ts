import { addMonths } from "date-fns";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { deleteProject } from "@/lib/actions/project";
import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { completeMonthsElapsed } from "@/lib/actions/workspaces/utils";
import { cache, WORKSPACE_BYTES_USAGE_CACHE_KEY } from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, projects, subscriptionTiers, users, workspaces } from "@/lib/db/migrations/schema";
import { isCurrentUserMemberOfWorkspace } from "@/lib/db/utils";
import { Workspace, WorkspaceTier, WorkspaceUsage, WorkspaceUser } from "@/lib/workspaces/types";

const LAST_WORKSPACE_ID = "last-workspace-id";
const MAX_AGE = 60 * 60 * 24 * 30;

const DeleteWorkspaceSchema = z.object({
  workspaceId: z.string(),
});

const UpdateWorkspaceSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1, { error: "Workspace name is required" }),
});

const GetWorkspaceSchema = z.object({
  workspaceId: z.string(),
});

const GetWorkspaceUsersSchema = z.object({
  workspaceId: z.string(),
});

const UpdateRoleSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  role: z.enum(["member", "admin"]),
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

  const result = await db.delete(workspaces).where(eq(workspaces.id, workspaceId));

  if (result.count === 0) {
    throw new Error("Workspace not found");
  }

  return { success: true, message: "Workspace deleted successfully" };
}

export const getWorkspace = async (input: z.infer<typeof GetWorkspaceSchema>): Promise<Workspace> => {
  const { workspaceId } = GetWorkspaceSchema.parse(input);

  if (!(await isCurrentUserMemberOfWorkspace(workspaceId))) {
    throw new Error("Unauthorized: User is not a member of this workspace");
  }

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

  return {
    id: workspace[0].id,
    name: workspace[0].name,
    tierName: workspace[0].tierName as WorkspaceTier,
  };
};

export const getWorkspaceUsers = async (input: z.infer<typeof GetWorkspaceUsersSchema>): Promise<WorkspaceUser[]> => {
  const { workspaceId } = GetWorkspaceUsersSchema.parse(input);

  if (!(await isCurrentUserMemberOfWorkspace(workspaceId))) {
    throw new Error("Unauthorized: User is not a member of this workspace");
  }

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

  return workspace as Workspace;
};

export const getWorkspaceUsage = async (workspaceId: string): Promise<WorkspaceUsage> => {
  const resetTime = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: {
      resetTime: true,
    },
  });

  if (!resetTime) {
    throw new Error("Workspace not found");
  }

  const resetTimeDate = new Date(resetTime.resetTime);
  const latestResetTime = addMonths(resetTimeDate, completeMonthsElapsed(resetTimeDate, new Date()));

  const cacheKey = `${WORKSPACE_BYTES_USAGE_CACHE_KEY}:${workspaceId}`;
  try {
    const cachedUsage = await cache.get<number>(cacheKey);
    if (cachedUsage !== null) {
      return {
        totalBytesIngested: Number(cachedUsage),
        resetTime: latestResetTime,
      };
    }
  } catch (error) {
    // If cache fails, continue to ClickHouse query
    console.error("Error reading from cache:", error);
  }

  // Cache miss - query ClickHouse for the actual breakdown
  const projectIds = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    columns: {
      id: true,
    },
  });

  if (projectIds.length === 0) {
    return {
      totalBytesIngested: 0,
      resetTime: latestResetTime,
    };
  }

  const query = `WITH spans_bytes_ingested AS (
      SELECT
        SUM(spans.size_bytes) as spans_bytes_ingested
      FROM spans
      WHERE project_id IN { projectIds: Array(UUID) }
      AND spans.start_time >= { latestResetTime: DateTime(3, "UTC") }
    ),
    browser_session_events_bytes_ingested AS (
      SELECT
        SUM(browser_session_events.size_bytes) as browser_session_events_bytes_ingested
      FROM browser_session_events
      WHERE project_id IN { projectIds: Array(UUID) }
      AND browser_session_events.timestamp >= { latestResetTime: DateTime(3, "UTC") }
    ),
    events_bytes_ingested AS (
      SELECT
        SUM(events.size_bytes) as events_bytes_ingested
      FROM events
      WHERE project_id IN { projectIds: Array(UUID) }
      AND events.timestamp >= { latestResetTime: DateTime(3, "UTC") }
    )
    SELECT
      spans_bytes_ingested,
      browser_session_events_bytes_ingested,
      events_bytes_ingested
    FROM spans_bytes_ingested, browser_session_events_bytes_ingested, events_bytes_ingested`;

  const bytesIngested = await clickhouseClient.query({
    query,
    format: "JSONEachRow",
    query_params: {
      projectIds: projectIds.map((project) => project.id),
      latestResetTime: latestResetTime.toISOString().replace(/Z$/, ""),
    },
  });

  const result = await bytesIngested.json<{
    spans_bytes_ingested: number;
    browser_session_events_bytes_ingested: number;
    events_bytes_ingested: number;
  }>();

  if (result.length === 0) {
    throw new Error("Error getting workspace usage");
  }

  const totalBytesIngested =
    Number(result[0].spans_bytes_ingested) +
    Number(result[0].browser_session_events_bytes_ingested) +
    Number(result[0].events_bytes_ingested);

  return {
    totalBytesIngested,
    resetTime: latestResetTime,
  };
};

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

export { LAST_WORKSPACE_ID, MAX_AGE };

export const TransferOwnershipSchema = z.object({
  workspaceId: z.string(),
  currentOwnerId: z.string(),
  newOwnerId: z.string(),
});

export async function transferOwnership(input: z.infer<typeof TransferOwnershipSchema>) {
  const { workspaceId, newOwnerId, currentOwnerId } = TransferOwnershipSchema.parse(input);

  // Проверяем, что новый owner существует в workspace
  const newOwner = await db.query.membersOfWorkspaces.findFirst({
    where: and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, newOwnerId)),
  });

  if (!newOwner) {
    throw new Error("New owner not found in workspace");
  }

  if (newOwner.memberRole !== "admin") {
    throw new Error("New owner must be an admin");
  }

  // Атомарная транзакция: деградируем текущего owner и повышаем нового
  await db.transaction(async (tx) => {
    // Текущий owner -> admin
    await tx
      .update(membersOfWorkspaces)
      .set({ memberRole: "admin" })
      .where(and(eq(membersOfWorkspaces.userId, currentOwnerId), eq(membersOfWorkspaces.workspaceId, workspaceId)));

    // Новый admin -> owner
    await tx
      .update(membersOfWorkspaces)
      .set({ memberRole: "owner" })
      .where(and(eq(membersOfWorkspaces.userId, newOwnerId), eq(membersOfWorkspaces.workspaceId, workspaceId)));
  });

  return { success: true };
}
