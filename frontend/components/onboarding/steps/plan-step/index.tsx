"use client";

import { useRouter } from "next/navigation";
import { useFormContext } from "react-hook-form";

import { useOnboardingContext } from "@/components/onboarding/context";
import StepShell from "@/components/onboarding/step-shell";
import PlanCard from "@/components/onboarding/steps/plan-step/plan-card";
import { PLANS } from "@/components/onboarding/steps/plan-step/plans";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { useOnboardingActions } from "@/components/onboarding/use-onboarding-actions";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { TIER_CONFIG } from "@/lib/actions/checkout/types";
import { Feature } from "@/lib/features/features";
import { track } from "@/lib/posthog";

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
  const { isSubmitting, finishFreeTier } = useOnboardingActions();

  const subscriptionEnabled = flags[Feature.SUBSCRIPTION];
  const selectedTier = watch("selectedTier");
  const workspaceName = watch("workspaceName");

  const nextLabel = selectedTier === "free" || !subscriptionEnabled ? "Finish and go to project" : "Upgrade & continue";

  const buildCheckoutUrl = () => {
    if (selectedTier === "free" || !resources.workspaceId) return null;
    const tier = selectedTier as keyof typeof TIER_CONFIG;
    const config = TIER_CONFIG[tier];
    if (!config) return null;
    const sp = new URLSearchParams({
      lookupKey: config.lookupKey,
      workspaceId: resources.workspaceId,
      workspaceName,
    });
    return `/checkout?${sp}`;
  };

  const finishAndGoToProject = async () => {
    track("onboarding", "completed", { tier: selectedTier });
    await finishFreeTier();
    if (resources.projectId) {
      router.push(`/project/${resources.projectId}/traces?onboarding=true`);
    } else {
      router.push("/projects");
    }
  };

  const handleNext = async () => {
    const checkoutUrl = buildCheckoutUrl();
    if (checkoutUrl) {
      // Stripe's success/cancel URLs land on the workspace billing page,
      // not back on /onboarding — so onboarding terminates here. Track and
      // clear the resume cookie before navigating away. keepalive keeps the
      // DELETE in flight across the impending window.location change; the
      // server-side cookie expires anyway if this fails.
      track("onboarding", "completed", { tier: selectedTier });
      fetch("/api/onboarding/state", { method: "DELETE", keepalive: true }).catch(() => {});
      window.location.href = checkoutUrl;
      return;
    }
    await finishAndGoToProject();
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

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Pick a plan"
      description="Free is pre-selected. You can always upgrade or downgrade later from billing."
      onNext={handleNext}
      onBack={onBack}
      nextLabel={nextLabel}
      isSubmitting={isSubmitting}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            selected={selectedTier === plan.id}
            onSelect={() => setValue("selectedTier", plan.id)}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Selecting a paid plan takes you to Stripe checkout. After payment, you'll land on your workspace billing page.
      </p>
    </StepShell>
  );
}
