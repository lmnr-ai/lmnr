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
  const { isSubmitting, finishFreeTier, beginSubmitting } = useOnboardingActions();

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
      // Tells /checkout to set Stripe's success_url back to /onboarding so the
      // wizard can run a single unified finalize path (DELETE cookie + route
      // to project) for both free and paid tiers. Without this, paid users
      // land on the workspace billing page where the subscription.created
      // webhook may not have fired yet, showing a stale tier.
      returnTo: "onboarding",
    });
    return `/checkout?${sp}`;
  };

  const finishAndGoToProject = async () => {
    if (!(await finishFreeTier())) return;
    // Hold the loading state through router.push so the button can't be
    // re-clicked while the project route mounts.
    beginSubmitting();
    router.push(resources.projectId ? `/project/${resources.projectId}/traces?onboarding=true` : "/projects");
  };

  const handleNext = async () => {
    const checkoutUrl = buildCheckoutUrl();
    if (!checkoutUrl) {
      await finishAndGoToProject();
      return;
    }

    // Keep the onboarding cookie alive across the Stripe redirect — Stripe's
    // success_url comes back to /onboarding?upgraded=true, where the wizard
    // finalizes onboarding (DELETE cookie + route to project). If we cleared
    // the cookie here, the post-payment landing on /onboarding would just
    // bounce to /projects via the legacy-redirect gate.
    track("onboarding", "checkout_started", { tier: selectedTier });
    beginSubmitting();
    // Keep isSubmitting true through navigation — window.location.href tears
    // the document down, so releasing it would only let the user click during unload.
    window.location.href = checkoutUrl;
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
      description="Match the plan to your expected usage."
      hint="Hobby is our most popular plan - unlocks unlimited projects and teammates. Pro adds longer retention and private Slack support."
      onNext={handleNext}
      onBack={onBack}
      nextLabel={nextLabel}
      isSubmitting={isSubmitting}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 xl:gap-4 2xl:gap-5">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            selected={selectedTier === plan.id}
            onSelect={() => setValue("selectedTier", plan.id)}
          />
        ))}
      </div>
    </StepShell>
  );
}
