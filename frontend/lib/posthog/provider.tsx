"use client";

import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type PropsWithChildren, useEffect } from "react";

import { identify, init, posthog } from "@/lib/posthog/client";

interface PostHogProviderProps {
  telemetryEnabled: boolean;
  email?: string;
}

export function PostHogProvider({ children, telemetryEnabled, email }: PropsWithChildren<PostHogProviderProps>) {
  useEffect(() => {
    init(telemetryEnabled);
  }, [telemetryEnabled]);

  useEffect(() => {
    if (email) {
      identify(email, { email });
    }
  }, [email]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

/** Lightweight component that only identifies the user without adding another PHProvider layer. */
export function PostHogIdentifier({ email }: { email?: string }) {
  useEffect(() => {
    if (email) {
      identify(email, { email });
    }
  }, [email]);

  return null;
}
