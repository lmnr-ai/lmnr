"use client";

import { Loader2 } from "lucide-react";

import StepShell from "@/components/onboarding/step-shell";
import { ONBOARDING_STEPS } from "@/components/onboarding/types";

// Same frame as the workspace step it streams into, so the swap doesn't jump.
export default function OnboardingLoading() {
  return (
    <StepShell stepIndex={0} totalSteps={ONBOARDING_STEPS.length} title="Welcome to Laminar" centerContent>
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Setting up your workspace…</p>
    </StepShell>
  );
}
