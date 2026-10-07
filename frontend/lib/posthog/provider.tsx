"use client";

import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type PropsWithChildren, useEffect, useState } from "react";

import { identify, init, posthog } from "@/lib/posthog/client";

interface PostHogProviderProps {
  telemetryEnabled: boolean;
  email?: string;
}

export function PostHogProvider({ children, telemetryEnabled, email }: PropsWithChildren<PostHogProviderProps>) {
  // Init during render (lazy useState runs once, before children render), NOT
  // in useEffect: React runs child effects before parent effects, and the
  // module build of posthog-js does not buffer pre-init calls — it drops them
  // with a console warning. With effect-based init, every child track()/group()
  // fired on first mount of a full page load was silently lost.
  useState(() => {
    if (typeof window !== "undefined") {
      init(telemetryEnabled);
    }
    return null;
  });

  useEffect(() => {
    if (email) {
      identify(email, { email });
    }
  }, [email]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
