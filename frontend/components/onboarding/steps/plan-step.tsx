"use client";

import { Check } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";

import StepShell from "@/components/onboarding/step-shell";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { TIER_CONFIG } from "@/lib/actions/checkout/types";
import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils";

interface PlanOption {
  id: OnboardingFormValues["selectedTier"];
  name: string;
  price: string;
  priceSubtext: string;
  highlight?: boolean;
  features: string[];
}

const PLANS: PlanOption[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceSubtext: "/ mo",
    features: ["1 GB data", "1,000 Signals steps", "15 day retention", "1 project / 1 seat"],
  },
  {
    id: "hobby",
    name: "Hobby",
    price: "$30",
    priceSubtext: "/ mo",
    features: ["3 GB data", "5,000 Signals steps", "30 day retention", "Unlimited projects & seats"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$150",
    priceSubtext: "/ mo",
    highlight: true,
    features: ["10 GB data", "50,000 Signals steps", "90 day retention", "Slack support"],
  },
];

interface PlanStepProps {
  stepIndex: number;
  totalSteps: number;
  workspaceId?: string;
  workspaceName: string;
  subscriptionEnabled: boolean;
  onNext: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export default function PlanStep({
  stepIndex,
  totalSteps,
  workspaceId,
  workspaceName,
  subscriptionEnabled,
  onNext,
  onBack,
  isSubmitting,
}: PlanStepProps) {
  const { control, watch } = useFormContext<OnboardingFormValues>();
  const selectedTier = watch("selectedTier");

  const nextLabel = selectedTier === "free" || !subscriptionEnabled ? "Finish and go to project" : "Upgrade & continue";

  const buildCheckoutUrl = () => {
    if (selectedTier === "free" || !workspaceId) return null;
    const tier = selectedTier as keyof typeof TIER_CONFIG;
    const config = TIER_CONFIG[tier];
    if (!config) return null;
    const sp = new URLSearchParams({
      lookupKey: config.lookupKey,
      workspaceId,
      workspaceName,
    });
    return `/checkout?${sp}`;
  };

  const handleNext = () => {
    const checkoutUrl = buildCheckoutUrl();
    if (checkoutUrl) {
      // Stripe's success/cancel URLs land on the workspace billing page,
      // not back on /onboarding — so onboarding terminates here. Track and
      // clear the resume cookie before navigating away. keepalive keeps
      // the DELETE in flight across the impending window.location change.
      track("onboarding", "completed", { tier: selectedTier });
      try {
        void fetch("/api/onboarding/state", { method: "DELETE", keepalive: true });
      } catch {
        // Best-effort; server-side cookie will expire in a day anyway.
      }
      window.location.href = checkoutUrl;
      return;
    }
    onNext();
  };

  if (!subscriptionEnabled) {
    return (
      <StepShell
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        title="Almost there"
        description="Subscription management isn't configured in this environment, so you're all set on the Free tier."
        onNext={onNext}
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
      <Controller
        name="selectedTier"
        control={control}
        render={({ field }) => (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PLANS.map((plan) => {
              const isSelected = field.value === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => field.onChange(plan.id)}
                  className={cn(
                    "text-left rounded-lg border p-4 flex flex-col gap-3 transition-colors",
                    isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background",
                    plan.highlight && !isSelected && "border-primary/40"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{plan.name}</span>
                    {isSelected && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
                        Selected
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold">{plan.price}</span>
                    <span className="text-xs text-muted-foreground">{plan.priceSubtext}</span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <Check className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        )}
      />

      <p className="text-xs text-muted-foreground">
        Selecting a paid plan takes you to Stripe checkout. After payment, you'll land on your workspace billing page.
      </p>
    </StepShell>
  );
}
