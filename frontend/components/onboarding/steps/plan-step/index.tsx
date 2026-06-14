"use client";

import { useRouter } from "next/navigation";
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
}

export default function PlanStep({ stepIndex, totalSteps, onBack }: PlanStepProps) {
  const router = useRouter();
  const { watch, setValue } = useFormContext<OnboardingFormValues>();
  const { resources } = useOnboardingContext();
  const flags = useFeatureFlags();
  const { isSubmitting, finishOnboarding, beginSubmitting } = useOnboardingActions();

  const subscriptionEnabled = flags[Feature.SUBSCRIPTION];
  const selectedTier = watch("selectedTier");
  const currentTier = watch("currentTier");
  const workspaceName = watch("workspaceName");

  const alreadyOnPaidTier = currentTier !== "free";
  const isUpgrade = TIER_RANK[selectedTier] > TIER_RANK[currentTier];

  const getNextLabel = () => {
    if (!subscriptionEnabled) return "Finish and go to project";
    if (isUpgrade) return "Upgrade & continue";
    if (alreadyOnPaidTier) return "Continue to project";
    return "Finish and go to project";
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

  const finishAndGoToProject = async () => {
    if (!(await finishOnboarding())) return;
    beginSubmitting();
    router.push(resources.projectId ? `/project/${resources.projectId}/traces?onboarding=true` : "/projects");
  };

  const handleNext = async () => {
    const checkoutUrl = buildCheckoutUrl();
    if (!checkoutUrl) {
      await finishAndGoToProject();
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
        onNext={finishAndGoToProject}
        onBack={onBack}
        nextLabel="Finish and go to project"
        isSubmitting={isSubmitting}
      />
    );
  }

  const title = alreadyOnPaidTier ? "Your plan" : "Pick a plan";
  const description = alreadyOnPaidTier
    ? "You're already on a paid plan. Continue to your project."
    : "Match the plan to your expected usage.";

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title={title}
      description={description}
      onNext={handleNext}
      onBack={onBack}
      nextLabel={getNextLabel()}
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
