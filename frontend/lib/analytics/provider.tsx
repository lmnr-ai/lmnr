"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type PropsWithChildren, useEffect } from "react";

import { identify, init } from "./client";

interface AnalyticsProviderProps {
  telemetryEnabled: boolean;
  email?: string;
}

export const AnalyticsProvider = ({ children, telemetryEnabled, email }: PropsWithChildren<AnalyticsProviderProps>) => {
  useEffect(() => {
    init(telemetryEnabled);
  }, [telemetryEnabled]);

  useEffect(() => {
    if (email) {
      identify(email, { email });
    }
  }, [email]);

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
