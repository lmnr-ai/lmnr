"use client";

import { useEffect } from "react";
import { useFormContext } from "react-hook-form";

import { useOnboardingContext } from "@/components/onboarding/context";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { type OnboardingStep, PROGRESS_STEPS } from "@/lib/actions/onboarding/types";

// Saves the step and the queued choices on every step change, so a refresh, a closed tab or the
// Slack OAuth round trip resumes on the same step. Best-effort: a failed save only costs the resume
// point. The plan commit saves its own state.
export function useOnboardingProgress(step: OnboardingStep) {
  const form = useFormContext<OnboardingFormValues>();
  const { projectId } = useOnboardingContext().resources;

  useEffect(() => {
    if (!projectId || !(PROGRESS_STEPS as readonly OnboardingStep[]).includes(step)) return;

    const { invites, selectedTemplateNames } = form.getValues();
    fetch(`/api/projects/${projectId}/onboarding/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, pending: { invites, templateNames: selectedTemplateNames } }),
    }).catch((e) => console.error("Failed to save onboarding progress", e));
  }, [form, step, projectId]);
}
