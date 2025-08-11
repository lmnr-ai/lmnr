import { addMonths } from "date-fns";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { projects, workspaces } from "@/lib/db/migrations/schema";
import { WorkspaceUsage } from "@/lib/workspaces/types";

import { deleteProject } from "../project";
import { completeMonthsElapsed } from "./utils";

export const DeleteWorkspaceSchema = z.object({
  workspaceId: z.string(),
});

export const UpdateWorkspaceSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1, { error: "Workspace name is required" }),
});

export async function deleteWorkspace(input: z.infer<typeof DeleteWorkspaceSchema>) {
  const { workspaceId } = DeleteWorkspaceSchema.parse(input);

  const projectsInWorkspace = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    columns: {
      id: true,
    },
  });

  for (const project of projectsInWorkspace) {
    await deleteProject({ projectId: project.id });
  }

  const result = await db.delete(workspaces).where(eq(workspaces.id, workspaceId));

  if (result.count === 0) {
    throw new Error("Workspace not found");
  }

  return { success: true, message: "Workspace deleted successfully" };
}

export async function updateWorkspace(input: z.infer<typeof UpdateWorkspaceSchema>) {
  const { workspaceId, name } = UpdateWorkspaceSchema.parse(input);

  const result = await db.update(workspaces).set({ name }).where(eq(workspaces.id, workspaceId));

  if (result.count === 0) {
    throw new Error("Workspace not found");
  }

  return { success: true, message: "Workspace renamed successfully" };
}

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
