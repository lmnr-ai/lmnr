import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { ApiError, NotFoundError } from "@/lib/api/errors";
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
    // Serializes an agent's deletes, so each one sees the others when it re-points `shown_version_hash`.
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
        shownVersionHash: agentVersions.shownVersionHash,
      })
      .from(agentVersions)
      .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.projectId, projectId)));
    const version = versions.find((v) => v.id === versionId && !v.deletedAt);
    if (!version) throw new NotFoundError("Version not found");
    if (version.versionNumber === 1) throw new ApiError("v1 can't be deleted.", 400);
    version.deletedAt = new Date().toISOString();

    // Versions shown under this one move to the version it is now shown under.
    const shownAs = shownVersionIds(versions);
    const hashById = new Map(versions.map((v) => [v.id, v.versionHash]));
    for (const v of versions) {
      const shownVersionHash = hashById.get(shownAs.get(v.id) ?? "");
      if (!v.deletedAt || !shownVersionHash) continue;
      if (v.id !== versionId && v.shownVersionHash === shownVersionHash) continue;
      await tx
        .update(agentVersions)
        .set({ deletedAt: v.deletedAt, shownVersionHash })
        .where(eq(agentVersions.id, v.id));
    }
  });
}
