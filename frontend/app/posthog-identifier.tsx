"use client";

import { usePostHog } from "posthog-js/react";
import { useEffect } from "react";

interface PostHogIdentifierProps {
  email: string;
}

export default function PostHogIdentifier({ email }: PostHogIdentifierProps) {
  const posthog = usePostHog();

  useEffect(() => {
    posthog?.identify(email, { email });
  }, [email, posthog]);

  return null;
}
