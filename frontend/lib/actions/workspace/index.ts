import { addMonths } from "date-fns";
import { and, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { z } from "zod/v4";

import { stripe } from "@/lib/actions/checkout/stripe.ts";
import { deleteProject } from "@/lib/actions/project";
import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { completeMonthsElapsed } from "@/lib/actions/workspaces/utils";
import { authOptions } from "@/lib/auth";
import {
  cache,
  PROJECT_MEMBER_CACHE_KEY,
  WORKSPACE_BYTES_USAGE_CACHE_KEY,
  WORKSPACE_MEMBER_CACHE_KEY,
  WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY,
} from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";
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
import { isoToClickHouseParam } from "@/lib/time/timestamp";
import { type Workspace, type WorkspaceTier, type WorkspaceUsage, type WorkspaceUser } from "@/lib/workspaces/types";

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

const RemoveUserSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
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

export const getWorkspaceUsage = async (workspaceId: string): Promise<WorkspaceUsage> => {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { resetTime: true },
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const resetTimeDate = new Date(workspace.resetTime);
  const latestResetTime = addMonths(resetTimeDate, completeMonthsElapsed(resetTimeDate, new Date()));
  const latestResetTimeStr = isoToClickHouseParam(latestResetTime.toISOString());

  // --- Bytes: cache → ClickHouse fallback ---
  let totalBytesIngested = null;
  const bytesCacheKey = `${WORKSPACE_BYTES_USAGE_CACHE_KEY}:${workspaceId}`;
  try {
    const cached = await cache.get<number>(bytesCacheKey);
    totalBytesIngested = cached;
  } catch (error) {
    console.error("Error reading bytes usage from cache:", error);
  }

  // --- Signal runs: cache → ClickHouse fallback ---
  let totalSignalRuns = null;
  const signalRunsCacheKey = `${WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY}:${workspaceId}`;
  try {
    const cached = await cache.get<number>(signalRunsCacheKey);
    totalSignalRuns = cached;
  } catch (error) {
    console.error("Error reading signal runs usage from cache:", error);
  }

  // If both came from cache, return early
  if (totalBytesIngested !== null && totalSignalRuns !== null) {
    return { totalBytesIngested, totalSignalRuns, resetTime: latestResetTime };
  }

  // Need ClickHouse — fetch project IDs once
  const projectRows = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    columns: { id: true },
  });

  if (projectRows.length === 0) {
    return {
      totalBytesIngested: totalBytesIngested ?? 0,
      totalSignalRuns: totalSignalRuns ?? 0,
      resetTime: latestResetTime,
    };
  }

  const projectIds = projectRows.map((p) => p.id);

  if (totalBytesIngested === null) {
    const bytesQuery = `WITH spans_bytes_ingested AS (
      SELECT SUM(spans.size_bytes) as spans_bytes_ingested
      FROM spans
      WHERE project_id IN { projectIds: Array(UUID) }
      AND spans.start_time >= { latestResetTime: DateTime(3, "UTC") }
    ),
    browser_session_events_bytes_ingested AS (
      SELECT SUM(browser_session_events.size_bytes) as browser_session_events_bytes_ingested
      FROM browser_session_events
      WHERE project_id IN { projectIds: Array(UUID) }
      AND browser_session_events.timestamp >= { latestResetTime: DateTime(3, "UTC") }
    )
    SELECT
      spans_bytes_ingested + browser_session_events_bytes_ingested as total_bytes_ingested
    FROM spans_bytes_ingested, browser_session_events_bytes_ingested`;

    const bytesResult = await clickhouseClient.query({
      query: bytesQuery,
      format: "JSONEachRow",
      query_params: { projectIds, latestResetTime: latestResetTimeStr },
    });
    const bytesRows = await bytesResult.json<{ total_bytes_ingested: number }>();
    totalBytesIngested = bytesRows.length > 0 ? Number(bytesRows[0].total_bytes_ingested) : 0;
  }

  if (totalSignalRuns === null) {
    const signalRunsQuery = `SELECT COUNT(*) as total_signal_runs
    FROM signal_runs
    WHERE project_id IN { projectIds: Array(UUID) }
    AND signal_runs.updated_at >= { latestResetTime: DateTime(3, "UTC") }
    AND signal_runs.status = 1`;

    const signalRunsResult = await clickhouseClient.query({
      query: signalRunsQuery,
      format: "JSONEachRow",
      query_params: { projectIds, latestResetTime: latestResetTimeStr },
    });
    const signalRunsRows = await signalRunsResult.json<{ total_signal_runs: number }>();
    totalSignalRuns = signalRunsRows.length > 0 ? Number(signalRunsRows[0].total_signal_runs) : 0;
  }

  return { totalBytesIngested, totalSignalRuns, resetTime: latestResetTime };
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

  const session = await getServerSession(authOptions);
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
