/// Notify the app-server to invalidate its cached custom model cost for a project.
/// Best-effort: logs errors but does not throw, so CRUD responses are not blocked.
export async function invalidateCustomModelCostsCache(
  projectId: string,
  model: string,
  provider?: string
): Promise<void> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_URL}/api/v1/projects/${projectId}/custom-model-costs/invalidate-cache`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, provider: provider ?? null }),
        cache: "no-store",
      }
    );
    if (!res.ok) {
      console.error("Cache invalidation returned non-OK status:", res.status);
    }
  } catch (error) {
    // Best-effort: don't block the CRUD response if cache invalidation fails.
    // The cache entry will expire naturally via TTL.
    console.error("Failed to invalidate custom model costs cache:", error);
  }
}
