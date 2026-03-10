import { cache } from "@/lib/cache";

const CUSTOM_MODEL_COSTS_CACHE_KEY = "custom_model_costs";

/**
 * Invalidate the custom model cost cache entry for a project + provider + model.
 *
 * Cache keys have the format `custom_model_costs:{project_id}:{provider}:{model}`,
 * matching the Rust backend's key construction. Provider may be empty string.
 *
 * Best-effort: logs errors but does not throw.
 */
export async function invalidateCustomModelCostsCache(
  projectId: string,
  provider: string,
  model: string
): Promise<void> {
  try {
    // Lowercase to match the Rust backend which lowercases model/provider
    // from span attributes before constructing cache keys.
    const normalizedModel = model.toLowerCase();
    const normalizedProvider = provider.toLowerCase();
    await cache.remove(`${CUSTOM_MODEL_COSTS_CACHE_KEY}:${projectId}:${normalizedProvider}:${normalizedModel}`);
  } catch (error) {
    // Best-effort: don't block the CRUD response if cache invalidation fails.
    // The cache entry will expire naturally via TTL.
    console.error("Failed to invalidate custom model costs cache:", error);
  }
}
