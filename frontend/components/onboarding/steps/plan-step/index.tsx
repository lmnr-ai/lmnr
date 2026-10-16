"use client";

import { useFormContext } from "react-hook-form";

import { useOnboardingContext } from "@/components/onboarding/context";
import StepShell from "@/components/onboarding/step-shell";
import FreePlanWarning from "@/components/onboarding/steps/plan-step/free-plan-warning";
import PlanCard from "@/components/onboarding/steps/plan-step/plan-card";
import { PLANS } from "@/components/onboarding/steps/plan-step/plans";
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
          : offerTrial
            ? `Match the plan to your expected usage. Starter comes with a ${TRIAL_DAYS}-day free trial, no card needed.`
            : "Match the plan to your expected usage."
      }
      onNext={handleNext}
      onBack={alreadyOnPaidTier ? undefined : onBack}
      nextLabel={nextLabel()}
      isSubmitting={isSubmitting}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 xl:gap-4 2xl:gap-5">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentTier;
          const isLocked = alreadyOnPaidTier && !isCurrent;
          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              selected={selectedTier === plan.id}
              disabled={isLocked}
              isCurrent={isCurrent}
              trialDays={offerTrial && plan.id === "hobby" ? TRIAL_DAYS : undefined}
              onSelect={() => {
                if (!isLocked) setValue("selectedTier", plan.id);
              }}
            />
          );
        })}
      </div>
      {selectedTier === "free" && !alreadyOnPaidTier && (
        <FreePlanWarning inviteCount={inviteCount} signalCount={signalCount} />
      )}
    </StepShell>
  );
}
