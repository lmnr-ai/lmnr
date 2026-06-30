// Clustering is a Pro+ feature — Free and Hobby tiers see real counts/structure but with
// names redacted. Pure tier-name predicate, safe to import from both client and server code.
export const getHasClusteringAccess = (tierName?: string | null): boolean => {
  if (!tierName) return false;
  const t = tierName.toLowerCase().trim();
  return t !== "free" && t !== "hobby";
};

// Replaces real cluster names in API responses for non-Pro callers. Same string for every
// cluster so the cluster list renders as a paywall preview.
export const PAYWALL_CLUSTER_NAME = "Clustering is a Pro feature";
