"use client";

import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type PropsWithChildren, useEffect } from "react";

import { identify, init, posthog, reset } from "@/lib/posthog/client";

interface PostHogProviderProps {
  telemetryEnabled: boolean;
  email?: string;
}

export function PostHogProvider({ children, telemetryEnabled, email }: PropsWithChildren<PostHogProviderProps>) {
  // Init during render, not in useEffect: child effects run before parent
  // effects, so effect-based init silently dropped events tracked on mount
  // (e.g. auth:sign_in_page_viewed). init() is idempotent and no-ops on SSR.
  init(telemetryEnabled);

  useEffect(() => {
    if (!telemetryEnabled || !email) return;
    // If a different account was identified on this browser and never reset
    // (e.g. legacy sessions from before reset-on-logout existed), posthog
    // skips the $identify merge entirely and keeps attributing events to the
    // old user. Reset first so the switch is recorded cleanly.
    const currentDistinctId = posthog.__loaded ? posthog.get_distinct_id() : undefined;
    if (posthog.__loaded && posthog._isIdentified() && currentDistinctId !== email) {
      reset();
    }
    identify(email, { email });
  }, [telemetryEnabled, email]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
