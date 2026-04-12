"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type PropsWithChildren, useEffect } from "react";

import { identify, init } from "./client";

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
  useEffect(() => {
    if (email) {
      identify(email, { email });
    }
  }, [email]);

  return null;
};
