"use client";

import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type PropsWithChildren, useEffect } from "react";

import { identify, init, posthog } from "@/lib/analytics/client";

interface AnalyticsProviderProps {
  telemetryEnabled: boolean;
  email?: string;
}

export function AnalyticsProvider({ children, telemetryEnabled, email }: PropsWithChildren<AnalyticsProviderProps>) {
  // Init eagerly during render (not in useEffect) so that child useEffect hooks
  // — which React fires depth-first (children before parents) — can already call
  // track() / identify() on initial mount without events being silently dropped.
  init(telemetryEnabled);

  useEffect(() => {
    if (email) {
      identify(email, { email });
    }
  }, [email]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

/** Lightweight component that only identifies the user without adding another PHProvider layer. */
export function AnalyticsIdentifier({ email }: { email?: string }) {
  useEffect(() => {
    if (email) {
      identify(email, { email });
    }
  }, [email]);

  return null;
}
