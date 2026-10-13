"use client";

import { Controller, useFormContext } from "react-hook-form";

import StepShell from "@/components/onboarding/step-shell";
import { ONBOARDING_SIGNALS } from "@/components/onboarding/steps/signals-step/constants";
import SignalCard from "@/components/onboarding/steps/signals-step/signal-card";
import { DEFAULT_SELECTED_TEMPLATE_NAMES, type OnboardingFormValues } from "@/components/onboarding/types";
import { useOnboardingActions } from "@/components/onboarding/use-onboarding-actions";

const RECOMMENDED: ReadonlySet<string> = new Set(DEFAULT_SELECTED_TEMPLATE_NAMES);

interface SignalsStepProps {
  stepIndex: number;
  totalSteps: number;
  onAdvance: () => void;
}

export default function SignalsStep({ stepIndex, totalSteps, onAdvance }: SignalsStepProps) {
  const { control, watch } = useFormContext<OnboardingFormValues>();
  const { isSubmitting, saveSignals } = useOnboardingActions();
  const selectedCount = watch("selectedTemplateNames")?.length ?? 0;

  const handleNext = async () => {
    if (await saveSignals()) onAdvance();
  };

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Set up signals"
      description="[don't forget to add that we have custom model to process it] A Signal analyzes every agent trace to catch logical errors, hallucinations, user frustration, etc. You can change or add Signals anytime."
      onNext={handleNext}
      nextDisabled={selectedCount === 0}
      isSubmitting={isSubmitting}
    >
      <Controller
        name="selectedTemplateNames"
        control={control}
        render={({ field }) => {
          const selected = new Set(field.value);
          const toggle = (name: string) => {
            const next = new Set(selected);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            field.onChange(Array.from(next));
          };

          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ONBOARDING_SIGNALS.map((signal) => (
                <SignalCard
                  key={signal.name}
                  signal={signal}
                  recommended={RECOMMENDED.has(signal.name)}
                  selected={selected.has(signal.name)}
                  onToggle={() => toggle(signal.name)}
                />
              ))}
            </div>
          );
        }}
      />
    </StepShell>
  );
}
