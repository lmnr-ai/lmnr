"use server";

import { cookies } from "next/headers";

import {
  type CommittedOnboardingStep,
  type DraftOnboardingStep,
  MAX_ONBOARDING_INVITES,
  ONBOARDING_COOKIE_NAME,
  ONBOARDING_COOKIE_VERSION,
  ONBOARDING_DRAFT_COOKIE_NAME,
  ONBOARDING_DRAFT_MAX_AGE_SECONDS,
  type OnboardingDraft,
  type OnboardingPending,
  type OnboardingState,
} from "@/lib/actions/onboarding/types";

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const COMMITTED_STEPS: readonly CommittedOnboardingStep[] = ["plan", "slack", "connect"];
const DRAFT_STEPS: readonly DraftOnboardingStep[] = ["workspace", "invite", "signals", "plan"];

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
  if (!COMMITTED_STEPS.includes(parsed.step as CommittedOnboardingStep)) return null;
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

export const setOnboardingDraft = async (draft: OnboardingDraft): Promise<void> => {
  const cookieStore = await cookies();
  cookieStore.set(ONBOARDING_DRAFT_COOKIE_NAME, JSON.stringify(draft), {
    maxAge: ONBOARDING_DRAFT_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
};

// Shape-checked on read too, and only honoured for the user it was written for.
export const getOnboardingDraft = async (userId: string): Promise<OnboardingDraft | null> => {
  const cookieStore = await cookies();
  const parsed = parseJson(cookieStore.get(ONBOARDING_DRAFT_COOKIE_NAME)?.value);
  if (!parsed || parsed.userId !== userId) return null;
  if (!DRAFT_STEPS.includes(parsed.step as DraftOnboardingStep)) return null;
  if (typeof parsed.workspaceName !== "string" || typeof parsed.projectName !== "string") return null;
  if (!isPending(parsed)) return null;
  return {
    userId,
    step: parsed.step as DraftOnboardingStep,
    workspaceName: parsed.workspaceName,
    projectName: parsed.projectName,
    invites: parsed.invites as string[],
    templateNames: parsed.templateNames as string[],
  };
};

export const clearOnboardingDraft = async (): Promise<void> => {
  const cookieStore = await cookies();
  cookieStore.delete(ONBOARDING_DRAFT_COOKIE_NAME);
};
