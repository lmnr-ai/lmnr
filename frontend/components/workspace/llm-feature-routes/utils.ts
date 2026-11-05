import { type WorkspaceFeatureRoute } from "@/lib/actions/llm-feature-routes";

export type RouteTarget = { llmProfileId: string; model: string };

/**
 * What a settings group shows, given the workspace's rows: `null` when none of
 * its ids has a row (unset), the shared target when every id points at the
 * same profile + model, and `undefined` ("Mixed") otherwise, e.g. after a
 * partial edit in SQL. Saving any choice rewrites every id, which clears it.
 */
export const groupTarget = (featureIds: string[], routes: WorkspaceFeatureRoute[]): RouteTarget | null | undefined => {
  const rows = featureIds.map((id) => routes.find((r) => r.featureId === id));
  if (rows.every((r) => !r)) return null;
  const [first] = rows;
  if (!first || rows.some((r) => !r || r.llmProfileId !== first.llmProfileId || r.model !== first.model)) {
    return undefined;
  }
  return { llmProfileId: first.llmProfileId, model: first.model };
};

/** The note under an unset group: where its calls go instead. */
export const unsetHint = (isDefault: boolean, envProviderConfigured: boolean): string => {
  if (!isDefault) return "Uses Default.";
  return envProviderConfigured
    ? "Uses the LLM_PROVIDER environment variables."
    : "No LLM configured: these features stay off until a profile is selected.";
};
