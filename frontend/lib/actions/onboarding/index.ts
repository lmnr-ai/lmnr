"use server";

import { cookies } from "next/headers";

import {
  MAX_ONBOARDING_INVITES,
  ONBOARDING_COOKIE_NAME,
  ONBOARDING_COOKIE_VERSION,
  type OnboardingPending,
  type OnboardingState,
  SAVED_ONBOARDING_STEPS,
  type SavedOnboardingStep,
} from "@/lib/actions/onboarding/types";

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const isStringArray = (value: unknown, max: number): value is string[] =>
  Array.isArray(value) && value.length <= max && value.every((v) => typeof v === "string");

const isPending = (value: unknown): value is OnboardingPending => {
  const pending = value as Partial<OnboardingPending> | null;
  return (
    !!pending && isStringArray(pending.invites, MAX_ONBOARDING_INVITES) && isStringArray(pending.templateNames, 50)
  );
};

const parseJson = (raw: string | undefined): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const getOnboardingState = async (): Promise<OnboardingState | null> => {
  const cookieStore = await cookies();
  const parsed = parseJson(cookieStore.get(ONBOARDING_COOKIE_NAME)?.value);
  if (!parsed || parsed.v !== ONBOARDING_COOKIE_VERSION) return null;
  if (typeof parsed.userId !== "string" || typeof parsed.startedAt !== "number") return null;
  if (typeof parsed.workspaceId !== "string" || typeof parsed.projectId !== "string") return null;
  if (!SAVED_ONBOARDING_STEPS.includes(parsed.step as SavedOnboardingStep)) return null;
  // A malformed optional field drops only itself, not the user's progress.
  if (parsed.pending !== undefined && !isPending(parsed.pending)) delete parsed.pending;
  return parsed as unknown as OnboardingState;
};

export const setOnboardingState = async (state: OnboardingState): Promise<void> => {
  const cookieStore = await cookies();
  cookieStore.set(ONBOARDING_COOKIE_NAME, JSON.stringify(state), {
    maxAge: MAX_AGE,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
};

export const clearOnboardingState = async (): Promise<void> => {
  const cookieStore = await cookies();
  cookieStore.delete(ONBOARDING_COOKIE_NAME);
};
