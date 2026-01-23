// app/providers.tsx
"use client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

if (
  typeof window !== "undefined" &&
  (process.env.NEXT_PUBLIC_ANONYMOUS_TELEMETRY === "true" || process.env.NEXT_PUBLIC_TELEMETRY === "true")
) {
  posthog.init("phc_dUMdjfNKf11jcHgtn7juSnT4P1pO0tafsPUWt4PuwG7", {
    api_host: "https://p.laminar.sh",
    person_profiles: "identified_only",
    disable_session_recording: process.env.NEXT_PUBLIC_TELEMETRY !== "true",
  });
}

export function PHProvider({ children }: { children: React.ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
