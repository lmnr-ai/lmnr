import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { Feature } from "@/lib/features/features";
import { WorkspaceTier } from "@/lib/workspaces/types";

/** Slack delivery is not part of the Free plan. */
export const useSlackAvailable = (): boolean => {
  const { workspace } = useProjectContext();
  const featureFlags = useFeatureFlags();
  return !(featureFlags[Feature.SUBSCRIPTION] && workspace?.tierName === WorkspaceTier.FREE);
};
