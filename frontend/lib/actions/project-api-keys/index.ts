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
  // User that created the key — recorded for UI/auditing only, never cached.
  userId: z.guid().optional().nullable(),
  // Absolute expiry as an ISO timestamp; null = never expires.
  expiresAt: z.string().optional().nullable(),
});

const GetProjectApiKeysSchema = z.object({
  projectId: z.guid(),
});

const DeleteProjectApiKeySchema = z.object({
  projectId: z.guid(),
  id: z.guid(),
});

export interface ProjectApiKeyResponse {
  id: string;
  value: string;
  projectId: string;
  name: string | null;
  shorthand: string;
  isIngestOnly: boolean;
  expiresAt: string | null;
}

export async function createApiKey(input: z.infer<typeof CreateProjectApiKeySchema>): Promise<ProjectApiKeyResponse> {
  const { projectId, name, isIngestOnly, userId, expiresAt } = CreateProjectApiKeySchema.parse(input);

  const { value, hash, shorthand } = createProjectApiKey();

  const [key] = await db
    .insert(projectApiKeys)
    .values({
      projectId,
      name: name || null,
      hash,
      shorthand,
      isIngestOnly: isIngestOnly ?? false,
      userId: userId || null,
      expiresAt: expiresAt || null,
    })
    .returning();

  // Cache the newly created key. user_id is deliberately NOT cached (it's for the
  // UI only); expires_at IS cached so the app-server can enforce expiry lazily.
  const cacheKey = `${PROJECT_API_KEY_CACHE_KEY}:${hash}`;
  await cache.set(
    cacheKey,
    {
      projectId: key.projectId,
      name: key.name,
      hash: key.hash,
      shorthand: key.shorthand,
      isIngestOnly: key.isIngestOnly,
      expiresAt: key.expiresAt,
    },
    // Match the app-server's 1-day cache TTL so an expired key can't outlive its
    // window in cache; without expiry the app-server re-reads from the DB anyway.
    key.expiresAt ? { expireAt: new Date(key.expiresAt) } : {}
  );

  return {
    id: key.id,
    value,
    projectId,
    name: name || null,
    shorthand,
    isIngestOnly,
    expiresAt: key.expiresAt,
  };
}

export async function getApiKeys(input: z.infer<typeof GetProjectApiKeysSchema>): Promise<
  Array<{
    id: string;
    projectId: string;
    name?: string;
    shorthand: string;
    isIngestOnly: boolean;
    expiresAt: string | null;
  }>
> {
  const { projectId } = GetProjectApiKeysSchema.parse(input);

  const apiKeys = await db
    .select({
      id: projectApiKeys.id,
      projectId: projectApiKeys.projectId,
      name: projectApiKeys.name,
      shorthand: projectApiKeys.shorthand,
      isIngestOnly: projectApiKeys.isIngestOnly,
      expiresAt: projectApiKeys.expiresAt,
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
