import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";

import { ApiError, NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { agentVersions } from "@/lib/db/migrations/schema";

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

  const [version] = await db
    .select({ versionNumber: agentVersions.versionNumber })
    .from(agentVersions)
    .where(
      and(
        eq(agentVersions.id, versionId),
        eq(agentVersions.agentId, agentId),
        eq(agentVersions.projectId, projectId),
        isNull(agentVersions.deletedAt)
      )
    );
  if (!version) throw new NotFoundError("Version not found");
  if (version.versionNumber === 1) throw new ApiError("v1 can't be deleted.", 400);

  await db.update(agentVersions).set({ deletedAt: new Date().toISOString() }).where(eq(agentVersions.id, versionId));
}
