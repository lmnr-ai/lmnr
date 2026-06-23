"use client";

import { CheckCircle2 } from "lucide-react";
import { useFormContext } from "react-hook-form";

import { useOnboardingContext } from "@/components/onboarding/context";
import StepShell from "@/components/onboarding/step-shell";
import PlanCard from "@/components/onboarding/steps/plan-step/plan-card";
import { PLANS } from "@/components/onboarding/steps/plan-step/plans";
import { type OnboardingFormValues, TIER_RANK } from "@/components/onboarding/types";
import { useOnboardingActions } from "@/components/onboarding/use-onboarding-actions";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { TIER_CONFIG } from "@/lib/actions/checkout/types";
import { Feature } from "@/lib/features/features";
import { track } from "@/lib/posthog";
import { withBasePath } from "@/lib/utils";

interface PlanStepProps {
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
  onAdvance: () => void;
  paymentSuccess?: boolean;
}

export default function PlanStep({ stepIndex, totalSteps, onBack, onAdvance, paymentSuccess }: PlanStepProps) {
  const { watch, setValue } = useFormContext<OnboardingFormValues>();
  const { resources } = useOnboardingContext();
  const flags = useFeatureFlags();
  const { isSubmitting, savePlan, beginSubmitting } = useOnboardingActions();

  const subscriptionEnabled = flags[Feature.SUBSCRIPTION];
  const selectedTier = watch("selectedTier");
  const currentTier = watch("currentTier");
  const workspaceName = watch("workspaceName");

  const alreadyOnPaidTier = currentTier !== "free";
  const isUpgrade = TIER_RANK[selectedTier] > TIER_RANK[currentTier];

  const getNextLabel = () => {
    if (!paymentSuccess && isUpgrade) return "Upgrade & continue";
    return "Continue";
  };

  const buildCheckoutUrl = () => {
    if (!isUpgrade || !resources.workspaceId) return null;
    const config = TIER_CONFIG[selectedTier as keyof typeof TIER_CONFIG];
    if (!config) return null;
    const sp = new URLSearchParams({
      lookupKey: config.lookupKey,
      workspaceId: resources.workspaceId,
      workspaceName,
      // Returns to /onboarding after Stripe so PaidFinalize can clear the cookie.
      returnTo: "onboarding",
    });
    return `/checkout?${sp}`;
  };

  const advanceToConnect = async () => {
    if (await savePlan()) onAdvance();
  };

  const handleNext = async () => {
    if (paymentSuccess) {
      await advanceToConnect();
      return;
    }
    const checkoutUrl = buildCheckoutUrl();
    if (!checkoutUrl) {
      await advanceToConnect();
      return;
    }
    track("onboarding", "checkout_started", { tier: selectedTier, from_tier: currentTier });
    beginSubmitting();
    window.location.href = withBasePath(checkoutUrl);
  };

  if (!subscriptionEnabled) {
    return (
      <StepShell
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        title="Almost there"
        description="Subscription management isn't configured in this environment, so you're all set on the Free tier."
        onNext={advanceToConnect}
        onBack={onBack}
        nextLabel="Continue"
        isSubmitting={isSubmitting}
      />
    );
  }

  const title = paymentSuccess ? "You're all set" : alreadyOnPaidTier ? "Your plan" : "Pick a plan";
  const description = paymentSuccess
    ? "Your subscription is active."
    : alreadyOnPaidTier
      ? "You're already on a paid plan. Continue to your project."
      : "Match the plan to your expected usage.";

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title={title}
      description={description}
      onNext={handleNext}
      onBack={paymentSuccess ? undefined : onBack}
      nextLabel={getNextLabel()}
      isSubmitting={isSubmitting}
    >
      {paymentSuccess && (
        <div className="flex items-center gap-3 rounded-md border border-success/40 bg-success/5 px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-success" />
          <span className="text-sm text-secondary-foreground">
            Payment received — manage billing anytime from workspace settings.
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 xl:gap-4 2xl:gap-5">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentTier;
          const isLocked = paymentSuccess || (alreadyOnPaidTier && !isCurrent);
          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              selected={selectedTier === plan.id}
              disabled={isLocked}
              isCurrent={isCurrent}
              onSelect={() => {
                if (isLocked) return;
                setValue("selectedTier", plan.id);
              }}
            />
          );
        })}
      </div>
    </StepShell>
  );
}
