import { addMonths } from "date-fns";
import { desc, eq, sql } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { z } from "zod/v4";

import { authOptions } from "@/lib/auth";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import {
  apiKeys,
  membersOfWorkspaces,
  projects,
  subscriptionTiers,
  users,
  workspaces,
} from "@/lib/db/migrations/schema";
import { isCurrentUserMemberOfWorkspace } from "@/lib/db/utils";
import {
  Workspace,
  WorkspaceTier,
  WorkspaceUsage,
  WorkspaceUser,
  WorkspaceWithProjects,
  WorkspaceWithUsers,
} from "@/lib/workspaces/types";

import { createProject } from "../projects";
import { completeMonthsElapsed } from "./utils";

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required"),
  projectName: z.string().optional(),
});

export const GetWorkspaceSchema = z.object({
  workspaceId: z.string(),
});

export async function createWorkspace(input: z.infer<typeof CreateWorkspaceSchema>): Promise<WorkspaceWithProjects> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Unauthorized: User not authenticated");
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
}

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

export const getWorkspace = async (input: z.infer<typeof GetWorkspaceSchema>): Promise<WorkspaceWithUsers> => {
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

  return {
    id: workspace[0].id,
    name: workspace[0].name,
    tierName: workspace[0].tierName as WorkspaceTier,
    users: workspaceUsers,
  };
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
  const projectIds = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    columns: {
      id: true,
    },
  });

  const resetTime = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: {
      resetTime: true,
    },
  });

  if (!resetTime) {
    throw new Error("Workspace not found");
  }

  if (projectIds.length === 0) {
    return {
      spansBytesIngested: 0,
      browserSessionEventsBytesIngested: 0,
      eventsBytesIngested: 0,
      resetTime: new Date(resetTime.resetTime),
    };
  }

  const resetTimeDate = new Date(resetTime.resetTime);

  const latestResetTime = addMonths(resetTimeDate, completeMonthsElapsed(resetTimeDate, new Date()));
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

  return {
    spansBytesIngested: Number(result[0].spans_bytes_ingested),
    browserSessionEventsBytesIngested: Number(result[0].browser_session_events_bytes_ingested),
    eventsBytesIngested: Number(result[0].events_bytes_ingested),
    resetTime: latestResetTime,
  };
};
