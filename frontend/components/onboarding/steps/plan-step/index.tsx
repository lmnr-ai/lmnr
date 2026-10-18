"use client";

import { useEffect } from "react";
import { useFormContext } from "react-hook-form";

import { useOnboardingContext } from "@/components/onboarding/context";
import StepShell from "@/components/onboarding/step-shell";
import FreePlanWarning from "@/components/onboarding/steps/plan-step/free-plan-warning";
import PlanTable from "@/components/onboarding/steps/plan-step/plan-table";
import { type PlanColumn, PLANS, SHARED_FEATURES } from "@/components/onboarding/steps/plan-step/plans";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { type CommitPlan, useOnboardingActions } from "@/components/onboarding/use-onboarding-actions";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { TRIAL_DAYS } from "@/lib/actions/checkout/types";
import { Feature } from "@/lib/features/features";
import { track } from "@/lib/posthog";
import { withBasePath } from "@/lib/utils";

interface PlanStepProps {
  stepIndex: number;
  totalSteps: number;
  onAdvance: () => void;
  onBack: () => void;
}

// Commits the plan: starts the trial or checkout and applies the queued invites and signals (not on Free).
export default function PlanStep({ stepIndex, totalSteps, onAdvance, onBack }: PlanStepProps) {
  const { watch, setValue } = useFormContext<OnboardingFormValues>();
  const { trialAvailable } = useOnboardingContext();
  const flags = useFeatureFlags();
  const { isSubmitting, commitPlan, beginSubmitting } = useOnboardingActions();

  const subscriptionEnabled = flags[Feature.SUBSCRIPTION];
  const selectedTier = watch("selectedTier");
  const currentTier = watch("currentTier");
  const inviteCount = watch("invites").length;
  const signalCount = watch("selectedTemplateNames").length;

  // Reached again after a paid checkout's webhook won the race against its return.
  const alreadyOnPaidTier = currentTier !== "free";
  const offerTrial = subscriptionEnabled && trialAvailable && !alreadyOnPaidTier;
  const startsTrial = offerTrial && selectedTier === "hobby";
  // While the trial is on offer, Free is where an unconverted trial lands, not a choice here.
  const plans = offerTrial ? PLANS.filter((plan) => plan.id !== "free") : PLANS;
  const columns: PlanColumn[] = plans.map((plan) => {
    const isCurrent = plan.id === currentTier;
    return {
      plan,
      selected: selectedTier === plan.id,
      disabled: alreadyOnPaidTier && !isCurrent,
      // A new workspace starts on Free; badging it "Current" nudges people away from the trial.
      isCurrent: alreadyOnPaidTier && isCurrent,
      trialDays: offerTrial && plan.id === "hobby" ? TRIAL_DAYS : undefined,
    };
  });

  useEffect(() => {
    track("onboarding", "plan_step_viewed", { trial_offered: offerTrial, current_tier: currentTier });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = async (choice: CommitPlan) => {
    const result = await commitPlan(choice);
    if (!result) return;
    if (result.next === "checkout" && result.checkoutUrl) {
      track("onboarding", "checkout_started", { tier: selectedTier });
      beginSubmitting();
      window.location.href = withBasePath(result.checkoutUrl);
      return;
    }
    onAdvance();
  };

  const handleNext = () => {
    if (!subscriptionEnabled || selectedTier === "free") return commit({ plan: "free" });
    if (alreadyOnPaidTier) return commit({ plan: "continue" });
    if (startsTrial) return commit({ plan: "trial" });
    return commit({ plan: "checkout", checkoutTier: selectedTier });
  };

  const nextLabel = () => {
    if (alreadyOnPaidTier || selectedTier === "free" || !subscriptionEnabled) return "Continue";
    if (startsTrial) return `Start ${TRIAL_DAYS}-day free trial`;
    return "Upgrade & continue";
  };

  if (!subscriptionEnabled) {
    return (
      <StepShell
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        title="Almost there"
        description="Subscription management isn't configured in this environment, so you're all set on the Free tier."
        onNext={handleNext}
        onBack={onBack}
        nextLabel="Continue"
        isSubmitting={isSubmitting}
      />
    );
  }

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title={alreadyOnPaidTier ? "Your plan" : "Pick a plan"}
      description={
        alreadyOnPaidTier
          ? "Your subscription is active. Continue to finish setting up."
          : "Match the plan to your expected usage."
      }
      onNext={handleNext}
      onBack={alreadyOnPaidTier ? undefined : onBack}
      nextLabel={nextLabel()}
      isSubmitting={isSubmitting}
    >
      <PlanTable columns={columns} onSelect={(tier) => setValue("selectedTier", tier)} />
      <p className="text-xs text-muted-foreground">{SHARED_FEATURES}</p>
      {selectedTier === "free" && !alreadyOnPaidTier && (
        <FreePlanWarning inviteCount={inviteCount} signalCount={signalCount} />
      )}
    </StepShell>
  );
}
