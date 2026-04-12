"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { type PropsWithChildren, useEffect } from "react";

import { init } from "./client";

interface AnalyticsProviderProps {
  telemetryEnabled: boolean;
}

export const AnalyticsProvider = ({ children, telemetryEnabled }: PropsWithChildren<AnalyticsProviderProps>) => {
  useEffect(() => {
    init(telemetryEnabled);
  }, [telemetryEnabled]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
};

export const AnalyticsIdentifier = ({ email }: { email: string }) => {
  const posthogClient = usePostHog();

  useEffect(() => {
    if (email && posthogClient) {
      posthogClient.identify(email, { email });
    }
  }, [email, posthogClient]);

  return null;
};
