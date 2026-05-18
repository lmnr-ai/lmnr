"use client";

import { AlertCircle, Brain, Check, CheckCircle, CloudOff, Frown, Shield, Target, Zap } from "lucide-react";
import { type ComponentType } from "react";
import { Controller, useFormContext } from "react-hook-form";

import StepShell from "@/components/onboarding/step-shell";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { useOnboardingActions } from "@/components/onboarding/use-onboarding-actions";
import signalTemplates from "@/components/signals/prompts";
import { cn } from "@/lib/utils";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "alert-circle": AlertCircle,
  brain: Brain,
  "check-circle": CheckCircle,
  frown: Frown,
  zap: Zap,
  shield: Shield,
  "cloud-off": CloudOff,
  target: Target,
};

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
      title="Choose what to monitor"
      description="Signals run on every trace to surface issues automatically. Pick at least one to set up — you can always change this later."
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
              {signalTemplates.map((template) => {
                const Icon = ICONS[template.icon] ?? AlertCircle;
                const isSelected = selected.has(template.name);
                return (
                  <button
                    key={template.name}
                    type="button"
                    onClick={() => toggle(template.name)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex items-start gap-3 text-left rounded-lg border p-3 transition-colors",
                      isSelected ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/50"
                    )}
                  >
                    <div className="mt-0.5 flex items-center gap-2 shrink-0">
                      <span
                        aria-hidden
                        className={cn(
                          "h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors",
                          isSelected ? "bg-primary border-primary text-primary-foreground" : "bg-muted border-border"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium text-secondary-foreground">{template.name}</span>
                      <span className="text-xs text-muted-foreground line-clamp-2">{template.description}</span>
                    </div>
                    <Icon className="h-4 w-4 min-w-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          );
        }}
      />
    </StepShell>
  );
}
