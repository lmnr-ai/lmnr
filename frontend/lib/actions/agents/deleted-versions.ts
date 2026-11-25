import { and, eq, isNull } from "drizzle-orm";
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
 * belong to the nearest earlier version still shown, or the nearest later one when none is left before it. The
 * app-server never reads `deleted_at`: it keeps tagging and comparing against the version, so it is never minted again.
 */
export function shownVersionIds(versions: VersionRef[]): Map<string, string> {
  const shown = versions.filter((v) => !v.deletedAt).sort((a, b) => a.versionNumber - b.versionNumber);
  const shownAs = new Map<string, string>();
  for (const version of versions) {
    if (!version.deletedAt) {
      shownAs.set(version.id, version.id);
      continue;
    }
    const target =
      shown.filter((v) => v.versionNumber < version.versionNumber).at(-1) ??
      shown.find((v) => v.versionNumber > version.versionNumber);
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
    // Locked so two concurrent deletes can't hide an agent's last two versions.
    const [agent] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
      .for("update");
    if (!agent) throw new NotFoundError("Agent not found");

    const shown = await tx
      .select({ id: agentVersions.id })
      .from(agentVersions)
      .where(and(eq(agentVersions.agentId, agentId), isNull(agentVersions.deletedAt)));
    if (!shown.some((v) => v.id === versionId)) throw new NotFoundError("Version not found");
    if (shown.length === 1) throw new ApiError("An agent's only version can't be deleted.", 400);

    await tx.update(agentVersions).set({ deletedAt: new Date().toISOString() }).where(eq(agentVersions.id, versionId));
  });
}
