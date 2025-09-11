"use client";

import { usePostHog } from "posthog-js/react";
import { useEffect } from "react";

import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";

interface PostHogIdentifierProps {
  email: string;
}

export default function PostHogIdentifier({ email }: PostHogIdentifierProps) {
  const posthog = usePostHog();

  useEffect(() => {
    // This runs in the browser and connects the current session with the user
    // Only identify users if production telemetry is enabled (includes user identification)
    if (email && posthog && isFeatureEnabled(Feature.POSTHOG_IDENTIFY)) {
      posthog.identify(email, {
        email: email,
      });
    }
  }, [email, posthog]);

  return null; // This component doesn't render anything
}
