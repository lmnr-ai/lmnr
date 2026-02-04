import { PostHog } from "posthog-node";

import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";

const POSTHOG_KEY = "phc_dUMdjfNKf11jcHgtn7juSnT4P1pO0tafsPUWt4PuwG7";
const POSTHOG_HOST = "https://p.laminar.sh";

export default function PostHogClient(): PostHog | null {
  if (!isFeatureEnabled(Feature.POSTHOG)) {
    return null;
  }

  return new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST });
}
