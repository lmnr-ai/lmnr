"use client";

import { usePostHog } from "posthog-js/react";
import { useEffect } from "react";

import { Feature, isFeatureEnabled } from "@/lib/features/features";

interface PostHogIdentifierProps {
  email: string;
}

export default function PostHogIdentifier({ email }: PostHogIdentifierProps) {
  const posthog = usePostHog();

  useEffect(() => {
    // This runs in the browser and connects the current session with the user
    if (isFeatureEnabled(Feature.POSTHOG_IDENTIFY) && email && posthog) {
      posthog.identify(email, {
        email: email,
      });
    }
  }, [email, posthog]);

  return null; // This component doesn't render anything
}
