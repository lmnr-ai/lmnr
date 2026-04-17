import { PostHog } from "posthog-node";

import { Feature, isFeatureEnabled } from "@/lib/features/features";

import { POSTHOG_HOST, POSTHOG_KEY } from "./constants";

export default function PostHogClient(): PostHog | null {
  if (!isFeatureEnabled(Feature.POSTHOG)) {
    return null;
  }

  return new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST });
}
