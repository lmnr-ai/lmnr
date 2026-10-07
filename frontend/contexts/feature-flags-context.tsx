"use client";

import { createContext, type PropsWithChildren, use } from "react";

import { Feature } from "@/lib/features/features";

export type FeatureFlags = Record<Feature, boolean>;

const defaultFlags = Object.fromEntries(Object.values(Feature).map((f) => [f, false])) as FeatureFlags;

const FeatureFlagsContext = createContext<FeatureFlags>(defaultFlags);

export const FeatureFlagsProvider = ({ children, flags }: PropsWithChildren<{ flags: FeatureFlags }>) => (
  <FeatureFlagsContext.Provider value={flags}>{children}</FeatureFlagsContext.Provider>
);

export function useFeatureFlags() {
  return use(FeatureFlagsContext);
}
