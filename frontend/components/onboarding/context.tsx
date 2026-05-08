"use client";

import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface OnboardingConfig {
  slackClientId?: string;
  slackRedirectUri?: string;
}

export interface OnboardingResources {
  workspaceId: string | null;
  projectId: string | null;
}

interface OnboardingContextValue extends OnboardingConfig {
  resources: OnboardingResources;
  setResources: (resources: OnboardingResources) => void;
  // Consumers awaiting a cookie DELETE must await this first. The wizard
  // POSTs to /api/onboarding/state on mount (fire-and-forget), and if a
  // resume at step 4 lets the user click Finish before that POST lands,
  // the POST's Set-Cookie can arrive AFTER the DELETE and resurrect the
  // cookie, bouncing the user back to /onboarding via the layout gate.
  waitForMountPersist: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

interface OnboardingProviderProps extends OnboardingConfig {
  initialResources: OnboardingResources;
  initialStep: number;
}

export function OnboardingProvider({
  slackClientId,
  slackRedirectUri,
  initialResources,
  initialStep,
  children,
}: PropsWithChildren<OnboardingProviderProps>) {
  const [resources, setResources] = useState<OnboardingResources>(initialResources);
  // useRef-of-promise so consumers can await the current-mount POST without
  // triggering re-renders when the promise resolves.
  const mountPersistRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    mountPersistRef.current = fetch("/api/onboarding/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: initialResources.workspaceId,
        projectId: initialResources.projectId,
        step: initialStep,
      }),
    }).then(
      () => undefined,
      () => undefined
    );
    // Intentionally single-shot — we only persist mount state once per wizard
    // load, and subsequent step persistence flows through `persistOnboardingStep`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const waitForMountPersist = useCallback(() => mountPersistRef.current, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({ slackClientId, slackRedirectUri, resources, setResources, waitForMountPersist }),
    [slackClientId, slackRedirectUri, resources, waitForMountPersist]
  );

  return <OnboardingContext value={value}>{children}</OnboardingContext>;
}

export function useOnboardingContext() {
  const ctx = use(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboardingContext must be used within an OnboardingProvider");
  }
  return ctx;
}
