import { cache } from "@/lib/cache";

const CUSTOM_MODEL_COSTS_CACHE_KEY = "custom_model_costs";

/**
 * Invalidate the custom model cost cache entry for a project + model.
 *
 * Cache keys have the format `custom_model_costs:{project_id}:{model}`.
 * Since custom costs use exact model name matching, we simply delete the
 * exact cache key — no glob patterns or variant expansion needed.
 *
 * Best-effort: logs errors but does not throw.
 */
export async function invalidateCustomModelCostsCache(projectId: string, model: string): Promise<void> {
  try {
    await cache.remove(`${CUSTOM_MODEL_COSTS_CACHE_KEY}:${projectId}:${model}`);
  } catch (error) {
    // Best-effort: don't block the CRUD response if cache invalidation fails.
    // The cache entry will expire naturally via TTL.
    console.error("Failed to invalidate custom model costs cache:", error);
  }
}
