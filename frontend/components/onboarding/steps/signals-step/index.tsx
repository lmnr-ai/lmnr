"use client";

import { Controller, useFormContext } from "react-hook-form";

import StepShell from "@/components/onboarding/step-shell";
import { ONBOARDING_SIGNALS } from "@/components/onboarding/steps/signals-step/constants";
import PipelineDiagram from "@/components/onboarding/steps/signals-step/pipeline-diagram";
import SignalCard from "@/components/onboarding/steps/signals-step/signal-card";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { DEFAULT_SELECTED_TEMPLATE_NAMES } from "@/lib/actions/onboarding/types";
import { track } from "@/lib/posthog";

const RECOMMENDED: ReadonlySet<string> = new Set(DEFAULT_SELECTED_TEMPLATE_NAMES);

interface SignalsStepProps {
  stepIndex: number;
  totalSteps: number;
  onAdvance: () => void;
  onBack?: () => void;
}

export default function SignalsStep({ stepIndex, totalSteps, onAdvance, onBack }: SignalsStepProps) {
  const { control, watch } = useFormContext<OnboardingFormValues>();
  const selectedCount = watch("selectedTemplateNames")?.length ?? 0;

  // Only records the choice; the signals are created when a trial or paid plan starts.
  const handleNext = () => {
    track("onboarding", "signals_selected", { count: selectedCount });
    onAdvance();
  };

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Set up signals"
      description={
        <>
          With signals you can analyze every agent trace to catch logical errors, hallucinations, user frustration, etc.
          Signals are powered by{" "}
          <a
            href="https://laminar.sh/blog/flow-1"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:underline"
          >
            flow-1
          </a>
          , our custom model optimized for high quality trace analysis at very low cost. You can edit or create custom
          Signals anytime.
        </>
      }
      onNext={handleNext}
      onBack={onBack}
      nextDisabled={selectedCount === 0}
    >
      <PipelineDiagram />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
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
