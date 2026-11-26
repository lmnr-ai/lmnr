import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { ApiError, NotFoundError } from "@/lib/api/errors";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { agents, agentVersions } from "@/lib/db/migrations/schema";

interface VersionRef {
  id: string;
  versionNumber: number;
  deletedAt: string | null;
}

/**
 * The id each version is shown as. Deleting a version says it changed nothing, so its traces, models and releases
 * belong to the nearest earlier version still shown; v1 can't be deleted, so there always is one. The app-server
 * never reads `deleted_at`: it keeps tagging and comparing against the version, so it is never minted again.
 */
export function shownVersionIds(versions: VersionRef[]): Map<string, string> {
  const shown = versions.filter((v) => !v.deletedAt).sort((a, b) => a.versionNumber - b.versionNumber);
  const shownAs = new Map<string, string>();
  for (const version of versions) {
    if (!version.deletedAt) {
      shownAs.set(version.id, version.id);
      continue;
    }
    const target = shown.filter((v) => v.versionNumber < version.versionNumber).at(-1);
    if (target) shownAs.set(version.id, target.id);
  }
  return shownAs;
}

export const DeleteAgentVersionSchema = z.object({
  projectId: z.guid(),
  agentId: z.guid(),
  versionId: z.guid(),
});

/** Hides a version that wasn't a real change, e.g. an optional tool that happened to be in every sampled trace. */
export async function deleteAgentVersion(input: z.infer<typeof DeleteAgentVersionSchema>): Promise<void> {
  const { projectId, agentId, versionId } = DeleteAgentVersionSchema.parse(input);

  await db.transaction(async (tx) => {
    // Serializes an agent's deletes, so each one maps every deleted version onto a version still shown.
    const [agent] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
      .for("update");
    if (!agent) throw new NotFoundError("Agent not found");

    const versions = await tx
      .select({
        id: agentVersions.id,
        versionHash: agentVersions.versionHash,
        versionNumber: agentVersions.versionNumber,
        deletedAt: agentVersions.deletedAt,
      })
      .from(agentVersions)
      .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.projectId, projectId)));
    const version = versions.find((v) => v.id === versionId && !v.deletedAt);
    if (!version) throw new NotFoundError("Version not found");
    if (version.versionNumber === 1) throw new ApiError("v1 can't be deleted.", 400);

    version.deletedAt = new Date().toISOString();
    await tx.update(agentVersions).set({ deletedAt: version.deletedAt }).where(eq(agentVersions.id, versionId));
    // Inside the transaction, so a failed ClickHouse write rolls the delete back.
    await writeDeletedVersions(projectId, versions);
  });
}

/** Rewrites where each of an agent's deleted versions is shown, for the traces views' `agent_versions`. */
async function writeDeletedVersions(
  projectId: string,
  versions: (VersionRef & { versionHash: string })[]
): Promise<void> {
  const shownAs = shownVersionIds(versions);
  const hashById = new Map(versions.map((v) => [v.id, v.versionHash]));
  const updatedAt = new Date().toISOString();
  const rows = versions.flatMap((v) => {
    const shownHash = hashById.get(shownAs.get(v.id) ?? "");
    if (!v.deletedAt || !shownHash) return [];
    return [
      { project_id: projectId, version_hash: v.versionHash, shown_version_hash: shownHash, updated_at: updatedAt },
    ];
  });

  // Sync, so the refetch right after the delete already reads the new mapping.
  await clickhouseClient.insert({
    table: "deleted_agent_versions",
    values: rows,
    format: "JSONEachRow",
    clickhouse_settings: { async_insert: 0 },
  });
}
