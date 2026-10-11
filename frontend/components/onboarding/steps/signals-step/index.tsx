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
      title="Set up your first Signal"
      description="A Signal watches every agent trace for a behavior you describe in plain text. Laminar groups recurring cases into patterns you can investigate and notifies you when a new one shows up. We recommend starting with the Failure Detector. You can change or add Signals anytime."
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
