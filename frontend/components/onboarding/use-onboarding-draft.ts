"use client";

import { useEffect } from "react";
import { useFormContext } from "react-hook-form";

import { useOnboardingContext } from "@/components/onboarding/context";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { type DraftOnboardingStep, DRAFT_STEPS, type OnboardingStep } from "@/lib/actions/onboarding/types";

// Saves the pre-commit answers whenever the draft step changes, so a refresh or a closed tab
// resumes on the same step. Best-effort: a failed save only costs the resume point. Stops once the
// plan commit created the workspace (the server deletes the draft then).
export function useOnboardingDraft(step: OnboardingStep) {
  const form = useFormContext<OnboardingFormValues>();
  const { resources } = useOnboardingContext();
  const committed = resources.workspaceId !== null;

  useEffect(() => {
    if (committed || !DRAFT_STEPS.includes(step as DraftOnboardingStep)) return;

    const { workspaceName, projectName, invites, selectedTemplateNames } = form.getValues();
    fetch("/api/onboarding/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, workspaceName, projectName, invites, templateNames: selectedTemplateNames }),
    }).catch((e) => console.error("Failed to save onboarding draft", e));
  }, [form, step, committed]);
}
