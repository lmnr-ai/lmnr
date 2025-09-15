// app/providers.tsx
"use client";
import posthog, { PostHogConfig } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { PropsWithChildren } from "react";

if (typeof window !== "undefined") {
  // Only initialize PostHog if telemetry is enabled
  if (
    process.env.NEXT_PUBLIC_ENABLE_TELEMETRY === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_PRODUCTION_TELEMETRY === "true"
  ) {
    const config: Partial<PostHogConfig> = {
      api_host: "https://p.laminar.sh",
      person_profiles: "identified_only",
    };

    if (process.env.NEXT_PUBLIC_ENABLE_PRODUCTION_TELEMETRY !== "true") {
      config.disable_session_recording = true;
    }

    posthog.init("phc_dUMdjfNKf11jcHgtn7juSnT4P1pO0tafsPUWt4PuwG7", config);
  }
}

export function PHProvider({ children }: PropsWithChildren) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
