"use client";

import { createContext, type ReactNode, useContext } from "react";

import { type LlmProfileOption } from "@/lib/actions/llm-profiles";
import { type LlmProfileProvider } from "@/lib/actions/llm-profiles/schema";

const LlmProfilesContext = createContext<LlmProfileOption[]>([]);

export function LlmProfilesProvider({ profiles, children }: { profiles: LlmProfileOption[]; children: ReactNode }) {
  return <LlmProfilesContext.Provider value={profiles}>{children}</LlmProfilesContext.Provider>;
}

/** Workspace profiles the playground can run on, as loaded by the page. */
export const useLlmProfiles = (): LlmProfileOption[] => useContext(LlmProfilesContext);

export const useLlmProfileProvider = (profileId: string | undefined): LlmProfileProvider | undefined =>
  useLlmProfiles().find((p) => p.id === profileId)?.provider;
