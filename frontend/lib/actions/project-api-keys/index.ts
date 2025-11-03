import { and, eq } from 'drizzle-orm';
import { z } from 'zod/v4';

import { createProjectApiKey } from '@/lib/api-keys';
import { cache, PROJECT_API_KEY_CACHE_KEY } from '@/lib/cache';
import { db } from '@/lib/db/drizzle';
import { projectApiKeys } from '@/lib/db/migrations/schema';

const CreateProjectApiKeySchema = z.object({
  projectId: z.string(),
  name: z.string().optional().nullable(),
  isIngestOnly: z.boolean().optional(),
});

const GetProjectApiKeysSchema = z.object({
  projectId: z.string(),
});

const DeleteProjectApiKeySchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export interface ProjectApiKeyResponse {
  value: string;
  projectId: string;
  name: string | null;
  shorthand: string;
}

export async function createApiKey(
  input: z.infer<typeof CreateProjectApiKeySchema>
): Promise<ProjectApiKeyResponse> {
  const { projectId, name, isIngestOnly } = CreateProjectApiKeySchema.parse(input);

  const { value, hash, shorthand } = createProjectApiKey();

  const [key] = await db
    .insert(projectApiKeys)
    .values({
      projectId,
      name: name || null,
      hash,
      shorthand,
      isIngestOnly: isIngestOnly ?? false,
    })
    .returning();

  // Cache the newly created key
  const cacheKey = `${PROJECT_API_KEY_CACHE_KEY}:${hash}`;
  await cache.set(cacheKey, {
    projectId: key.projectId,
    name: key.name,
    hash: key.hash,
    shorthand: key.shorthand,
    isIngestOnly: key.isIngestOnly,
  });

  return {
    value,
    projectId,
    name: name || null,
    shorthand,
  };
}

export async function getApiKeys(
  input: z.infer<typeof GetProjectApiKeysSchema>
): Promise<Array<{ id: string; projectId: string; name?: string; shorthand: string; isIngestOnly?: boolean }>> {
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
  return apiKeys.map(key => ({
    ...key,
    name: key.name ?? undefined,
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

