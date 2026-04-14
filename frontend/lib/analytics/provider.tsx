"use client";

import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type PropsWithChildren, useEffect, useLayoutEffect } from "react";

import { identify, init, posthog } from "@/lib/analytics/client";

interface AnalyticsProviderProps {
  telemetryEnabled: boolean;
  email?: string;
}

export function AnalyticsProvider({ children, telemetryEnabled, email }: PropsWithChildren<AnalyticsProviderProps>) {
  // useLayoutEffect fires synchronously after DOM mutations but before any
  // useEffect. This guarantees posthog.init() runs before child useEffect hooks
  // that call track() / identify(), without being a side effect during render.
  useLayoutEffect(() => {
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
export function AnalyticsIdentifier({ email }: { email?: string }) {
  useEffect(() => {
    if (email) {
      identify(email, { email });
    }
  }, [email]);

  return null;
}
