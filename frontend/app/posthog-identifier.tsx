"use client";

import { usePostHog } from "posthog-js/react";
import { useEffect } from "react";

interface PostHogIdentifierProps {
  email: string;
  isEnabled?: boolean;
}

export default function PostHogIdentifier({ email, isEnabled = false }: PostHogIdentifierProps) {
  const posthog = usePostHog();

  useEffect(() => {
    // This runs in the browser and connects the current session with the user
    // Only identify users if the feature is enabled (passed from server)
    if (email && posthog && isEnabled) {
      posthog.identify(email, {
        email: email,
      });
    }
  }, [email, posthog, isEnabled]);

  return null; // This component doesn't render anything
}
