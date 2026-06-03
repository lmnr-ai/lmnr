import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { createProjectApiKey } from "@/lib/api-keys";
import { cache, PROJECT_API_KEY_CACHE_KEY } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import { projectApiKeys } from "@/lib/db/migrations/schema";

const CreateProjectApiKeySchema = z.object({
  projectId: z.guid(),
  name: z.string().optional().nullable(),
  isIngestOnly: z.boolean(),
});

const GetProjectApiKeysSchema = z.object({
  projectId: z.guid(),
});

const DeleteProjectApiKeySchema = z.object({
  projectId: z.guid(),
  id: z.guid(),
});

export interface ProjectApiKeyResponse {
  value: string;
  projectId: string;
  name: string | null;
  shorthand: string;
  isIngestOnly: boolean;
  // SHA3-256 hex digest of `value`. Exposed so tx callers can populate the
  // cache post-commit via `cacheProjectApiKey` (see CLI grant approval).
  hash: string;
}

// Accept an optional drizzle transaction handle so callers can compose the
// insert with other writes that must roll back together (e.g. CLI auth grant
// approval, where minting the key and updating the grant row need to be
// atomic — see `approveGrant` in lib/actions/cli-login/index.ts). When no tx
// is passed we fall back to the singleton `db`.
type DrizzleExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createApiKey(
  input: z.infer<typeof CreateProjectApiKeySchema>,
  tx?: DrizzleExecutor
): Promise<ProjectApiKeyResponse> {
  const { projectId, name, isIngestOnly } = CreateProjectApiKeySchema.parse(input);

  const { value, hash, shorthand } = createProjectApiKey();
  const executor = tx ?? db;

  const [key] = await executor
    .insert(projectApiKeys)
    .values({
      projectId,
      name: name || null,
      hash,
      shorthand,
      isIngestOnly: isIngestOnly ?? false,
    })
    .returning();

  // Cache the newly created key. Skip when running inside a transaction —
  // otherwise a rollback would leave a phantom cache entry for a key that has
  // no DB row backing it. Tx callers are responsible for populating the cache
  // themselves after commit (see `cacheProjectApiKey` below).
  if (!tx) {
    await cacheProjectApiKey({
      projectId: key.projectId,
      name: key.name,
      hash,
      shorthand: key.shorthand,
      isIngestOnly: key.isIngestOnly,
    });
  }

  return {
    value,
    projectId,
    name: name || null,
    shorthand,
    isIngestOnly,
    hash,
  };
}

// Exposed for tx callers that need to populate the cache only after a
// successful commit. See the `!tx` skip in `createApiKey` above.
export async function cacheProjectApiKey(key: {
  projectId: string;
  name: string | null;
  hash: string;
  shorthand: string | null;
  isIngestOnly: boolean;
}): Promise<void> {
  const cacheKey = `${PROJECT_API_KEY_CACHE_KEY}:${key.hash}`;
  await cache.set(cacheKey, key);
}

export async function getApiKeys(
  input: z.infer<typeof GetProjectApiKeysSchema>
): Promise<Array<{ id: string; projectId: string; name?: string; shorthand: string; isIngestOnly: boolean }>> {
  const { projectId } = GetProjectApiKeysSchema.parse(input);

  const apiKeys = await db
    .select({
      id: projectApiKeys.id,
      projectId: projectApiKeys.projectId,
      name: projectApiKeys.name,
      shorthand: projectApiKeys.shorthand,
      isIngestOnly: projectApiKeys.isIngestOnly,
    })
    .from(projectApiKeys)
    .where(eq(projectApiKeys.projectId, projectId));

  // Convert null to undefined to match the expected type
  return apiKeys.map((key) => ({
    ...key,
    name: key.name ?? undefined,
    shorthand: key.shorthand ?? "",
  }));
}

export async function deleteApiKey(input: z.infer<typeof DeleteProjectApiKeySchema>): Promise<void> {
  const { projectId, id } = DeleteProjectApiKeySchema.parse(input);

  // Delete from database and get the hash to clear from cache
  const deleted = await db
    .delete(projectApiKeys)
    .where(and(eq(projectApiKeys.id, id), eq(projectApiKeys.projectId, projectId)))
    .returning({ hash: projectApiKeys.hash });

  // Clear from cache if deleted
  if (deleted.length > 0) {
    const cacheKey = `${PROJECT_API_KEY_CACHE_KEY}:${deleted[0].hash}`;
    await cache.remove(cacheKey);
  }
}
