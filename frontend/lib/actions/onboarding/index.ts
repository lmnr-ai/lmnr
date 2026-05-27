"use server";

import { cookies } from "next/headers";

import {
  ONBOARDING_COOKIE_NAME,
  ONBOARDING_COOKIE_VERSION,
  type OnboardingState,
} from "@/lib/actions/onboarding/types";

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const getOnboardingState = async (): Promise<OnboardingState | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ONBOARDING_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    if (parsed.v !== ONBOARDING_COOKIE_VERSION) return null;
    if (typeof parsed.userId !== "string") return null;
    if (typeof parsed.step !== "number") return null;
    if (typeof parsed.startedAt !== "number") return null;
    if (parsed.workspaceId !== null && typeof parsed.workspaceId !== "string") return null;
    if (parsed.projectId !== null && typeof parsed.projectId !== "string") return null;
    return parsed as OnboardingState;
  } catch {
    return null;
  }
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
