"use client";

import { createContext, type PropsWithChildren, use, useMemo, useState } from "react";

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
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

interface OnboardingProviderProps extends OnboardingConfig {
  initialResources: OnboardingResources;
}

export function OnboardingProvider({
  slackClientId,
  slackRedirectUri,
  initialResources,
  children,
}: PropsWithChildren<OnboardingProviderProps>) {
  const [resources, setResources] = useState<OnboardingResources>(initialResources);

  const value = useMemo<OnboardingContextValue>(
    () => ({ slackClientId, slackRedirectUri, resources, setResources }),
    [slackClientId, slackRedirectUri, resources]
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
