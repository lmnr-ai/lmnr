"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type PropsWithChildren, useEffect } from "react";

const POSTHOG_KEY = "phc_dUMdjfNKf11jcHgtn7juSnT4P1pO0tafsPUWt4PuwG7";
const POSTHOG_HOST = "https://p.laminar.sh";

interface PostHogProviderProps {
  telemetryEnabled: boolean;
}

export function PostHogProvider({ children, telemetryEnabled }: PropsWithChildren<PostHogProviderProps>) {
  useEffect(() => {
    if (telemetryEnabled) {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        person_profiles: "identified_only",
        capture_pageview: "history_change",
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*",
        },
      });
    }
  }, [telemetryEnabled]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
