import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { cache, PROJECT_API_KEY_CACHE_KEY, PROJECT_CACHE_KEY } from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { projectApiKeys, projects } from "@/lib/db/migrations/schema";

export const DeleteProjectSchema = z.object({
  projectId: z.uuid(),
});

export const UpdateProjectSchema = z.object({
  projectId: z.uuid(),
  name: z.string().min(1, { error: "Project name is required" }),
});

export async function deleteProject(input: z.infer<typeof DeleteProjectSchema>) {
  const { projectId } = DeleteProjectSchema.parse(input);

  try {
    // Make sure to delete the project api keys first, because they will be
    // cascade deleted from db once we delete the project.
    const result = await deleteProjectApiKeysFromCache(projectId);
    if (!result.success) {
      console.error("Failed to delete project api keys from cache. Failed keys:", result.failedKeys);
    }
  } catch (error) {
    console.error("Failed to delete project api keys from cache", error);
  }

  const workspaceId = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: {
      workspaceId: true,
    },
  });

  if (!workspaceId) {
    throw new Error("Project not found");
  }

  await deleteAllProjectsWorkspaceInfoFromCache(workspaceId.workspaceId);

  await db.delete(projects).where(eq(projects.id, projectId));
  const result = await deleteProjectDataFromClickHouse(projectId);

  if (!result.success) {
    throw new Error(`Failed to delete project data for ${result.tables.join(",")}`);
  }
}

export async function updateProject(input: z.infer<typeof UpdateProjectSchema>) {
  const { projectId, name } = UpdateProjectSchema.parse(input);

  const result = await db.update(projects).set({ name }).where(eq(projects.id, projectId));

  if (result.count === 0) {
    throw new Error("Project not found");
  }

  return { success: true, message: "Project renamed successfully" };
}

async function deleteProjectDataFromClickHouse(
  projectId: string
): Promise<{ success: true } | { success: false; tables: string[] }> {
  const tables = [
    "default.spans",
    "default.events",
    "default.evaluation_scores",
    "default.labels",
    "default.browser_session_events",
    "default.evaluator_scores",
  ];

  const deletionPromises = tables.map(async (table) => {
    try {
      await clickhouseClient.command({
        query: `ALTER TABLE ${table} DELETE WHERE project_id = {project_id: UUID}`,
        query_params: {
          project_id: projectId,
        },
      });
      return { table, success: true };
    } catch (error) {
      return { table, success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const results = await Promise.allSettled(deletionPromises);

  return results.reduce<{ success: true } | { success: false; tables: string[] }>(
    (acc, curr, index) => {
      const table = tables[index];

      if (curr.status === "rejected" || (curr.status === "fulfilled" && !curr.value.success)) {
        if ("tables" in acc) {
          return { success: false, tables: [...acc.tables, table] };
        } else {
          return { success: false, tables: [table] };
        }
      }

      return acc;
    },
    { success: true }
  );
}

async function deleteProjectApiKeysFromCache(projectId: string) {
  const apiKeys = await db.query.projectApiKeys.findMany({
    where: eq(projectApiKeys.projectId, projectId),
  });

  const results = await Promise.allSettled(
    apiKeys.map(async (apiKey) => {
      const cacheKey = `${PROJECT_API_KEY_CACHE_KEY}:${apiKey.hash}`;
      try {
        await cache.remove(cacheKey);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    })
  );

  return results.reduce<{ success: true } | { success: false; failedKeys: string[] }>(
    (acc, curr, index) => {
      const cacheKey = `${PROJECT_API_KEY_CACHE_KEY}:${apiKeys[index].hash}`;
      if (curr.status === "rejected" || (curr.status === "fulfilled" && !curr.value.success)) {
        if ("failedKeys" in acc) {
          return { success: false, failedKeys: [...acc.failedKeys, cacheKey] };
        } else {
          return { success: false, failedKeys: [cacheKey] };
        }
      }
      return acc;
    },
    { success: true }
  );
}

interface ProjectApiKeyData {
  projectId: string;
  name: string | null;
  hash: string;
  shorthand: string;
}

function isValidProjectApiKeyData(data: any): data is ProjectApiKeyData {
  return (
    data &&
    typeof data.projectId === "string" &&
    (data.name === null || typeof data.name === "string") &&
    typeof data.hash === "string" &&
    typeof data.shorthand === "string"
  );
}

export async function deleteAllProjectsWorkspaceInfoFromCache(workspaceId: string) {
  // Cache carries information about the projects in the workspace, so we need to delete it
  // when we delete or create a project in the workspace.
  const projectRows = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    columns: {
      id: true,
    },
  });

  await Promise.allSettled(
    projectRows.map(async (project) => {
      await deleteProjectWorkspaceInfoFromCache(project.id);
    })
  );
}

async function deleteProjectWorkspaceInfoFromCache(projectId: string) {
  const cacheKey = `${PROJECT_CACHE_KEY}:${projectId}`;
  await cache.remove(cacheKey);
}
