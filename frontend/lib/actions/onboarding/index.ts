"use server";

import { cookies } from "next/headers";

const ONBOARDING_COOKIE = "onboarding-state";
const MAX_AGE = 60 * 60 * 24; // 1 day

export interface OnboardingState {
  workspaceId: string;
  projectId: string;
  step: number;
}

export const getOnboardingState = async (): Promise<OnboardingState | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ONBOARDING_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OnboardingState;
    if (!parsed.workspaceId || !parsed.projectId || typeof parsed.step !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
};

export const setOnboardingState = async (state: OnboardingState): Promise<void> => {
  const cookieStore = await cookies();
  cookieStore.set(ONBOARDING_COOKIE, JSON.stringify(state), {
    maxAge: MAX_AGE,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
};

export const clearOnboardingState = async (): Promise<void> => {
  const cookieStore = await cookies();
  cookieStore.delete(ONBOARDING_COOKIE);
};
