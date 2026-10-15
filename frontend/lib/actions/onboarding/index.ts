"use server";

import { cookies } from "next/headers";
import { type z } from "zod/v4";

import {
  ONBOARDING_COOKIE_NAME,
  ONBOARDING_DRAFT_COOKIE_NAME,
  ONBOARDING_DRAFT_MAX_AGE_SECONDS,
  type OnboardingDraft,
  OnboardingDraftInputSchema,
  OnboardingDraftSchema,
  type OnboardingState,
  OnboardingStateSchema,
} from "@/lib/actions/onboarding/types";
import { getServerSession } from "@/lib/auth-session";

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Cookies are shape-checked on read: a stale or tampered one reads as absent.
const parseCookie = <T>(raw: string | undefined, schema: z.ZodType<T>): T | null => {
  if (!raw) return null;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export const getOnboardingState = async (): Promise<OnboardingState | null> => {
  const cookieStore = await cookies();
  return parseCookie(cookieStore.get(ONBOARDING_COOKIE_NAME)?.value, OnboardingStateSchema);
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

export const setOnboardingDraft = async (input: z.input<typeof OnboardingDraftInputSchema>): Promise<void> => {
  const session = await getServerSession();
  if (!session?.user) throw new Error("Unauthorized");
  const draft: OnboardingDraft = { ...OnboardingDraftInputSchema.parse(input), userId: session.user.id };

  const cookieStore = await cookies();
  cookieStore.set(ONBOARDING_DRAFT_COOKIE_NAME, JSON.stringify(draft), {
    maxAge: ONBOARDING_DRAFT_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
};

// Only honoured for the user it was written for.
export const getOnboardingDraft = async (userId: string): Promise<OnboardingDraft | null> => {
  const cookieStore = await cookies();
  const draft = parseCookie(cookieStore.get(ONBOARDING_DRAFT_COOKIE_NAME)?.value, OnboardingDraftSchema);
  return draft?.userId === userId ? draft : null;
};

export const clearOnboardingDraft = async (): Promise<void> => {
  const cookieStore = await cookies();
  cookieStore.delete(ONBOARDING_DRAFT_COOKIE_NAME);
};
