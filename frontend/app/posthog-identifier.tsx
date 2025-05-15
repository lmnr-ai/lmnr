// components/analytics/PostHogIdentifier.tsx
'use client';

import { usePostHog } from 'posthog-js/react';
import { useEffect } from 'react';

interface PostHogIdentifierProps {
  email: string
}

export default function PostHogIdentifier({ email }: PostHogIdentifierProps) {
  const posthog = usePostHog();

  useEffect(() => {
    // This runs in the browser and connects the current session with the user
    if (email && posthog) {
      posthog.identify(email, {
        email: email,
      });
    }
  }, [email]);

  return null; // This component doesn't render anything
}
