import { cache } from "@/lib/cache";

import { spanPathCacheKey } from "./span-path";

/**
 * Append an evaluator ID to the cache array for a given span path.
 * If no array exists, creates a new one with the single ID.
 */
export const appendEvaluatorIdToCache = async (
  projectId: string,
  spanPath: string[],
  evaluatorId: string
): Promise<void> => {
  const cacheKey = spanPathCacheKey(projectId, spanPath);
  const existingIds = await cache.get<string[]>(cacheKey);

  const updatedIds = existingIds ? [...existingIds, evaluatorId] : [evaluatorId];
  try {
    await cache.set(cacheKey, JSON.stringify(updatedIds));
  } catch (error) {
    console.error(`Failed to append evaluator ID to cache for project ${projectId}:`, error);
  }
};

/**
 * Remove an evaluator ID from the cache array for a given span path.
 */
export const removeEvaluatorIdFromCache = async (
  projectId: string,
  spanPath: string[],
  evaluatorId: string
): Promise<void> => {
  const cacheKey = spanPathCacheKey(projectId, spanPath);
  try {
    const existingIds = await cache.get<string[]>(cacheKey);

    if (!existingIds) {
      return;
    }

    const updatedIds = existingIds.filter(id => id !== evaluatorId);
    await cache.set(cacheKey, JSON.stringify(updatedIds));
  } catch (error) {
    console.error(`Failed to remove evaluator ID from cache for project ${projectId}:`, error);
  }
};
