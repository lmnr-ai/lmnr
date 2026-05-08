"use client";

import { AlertCircle, Brain, Check, CheckCircle, CloudOff, Frown, Shield, Target, Zap } from "lucide-react";
import { type ComponentType } from "react";
import { Controller, useFormContext } from "react-hook-form";

import StepShell from "@/components/onboarding/step-shell";
import { type OnboardingFormValues, type SignalOption } from "@/components/onboarding/types";
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

export const SIGNAL_OPTIONS: SignalOption[] = signalTemplates.map((t) => ({
  id: t.name,
  name: t.name,
  shortName: t.shortName,
  description: t.description,
  prompt: t.prompt,
  structuredOutputSchema: t.structuredOutputSchema,
}));

const ICON_BY_ID: Record<string, ComponentType<{ className?: string }>> = Object.fromEntries(
  signalTemplates.map((t) => [t.name, ICONS[t.icon] ?? AlertCircle])
);

interface SignalsStepProps {
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export default function SignalsStep({ stepIndex, totalSteps, onNext, onBack, isSubmitting }: SignalsStepProps) {
  const { control } = useFormContext<OnboardingFormValues>();

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Choose what to monitor"
      description="Signals run on every trace to surface issues automatically. Pick one or more to set up — you can always change this later."
      onNext={onNext}
      onBack={onBack}
      isSubmitting={isSubmitting}
    >
      <Controller
        name="selectedSignalIds"
        control={control}
        render={({ field }) => {
          const selected = new Set(field.value);
          const toggle = (id: string) => {
            const next = new Set(selected);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            field.onChange(Array.from(next));
          };

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
              {SIGNAL_OPTIONS.map((opt) => {
                const Icon = ICON_BY_ID[opt.id] ?? AlertCircle;
                const isSelected = selected.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(opt.id)}
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
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium text-secondary-foreground">{opt.name}</span>
                      <span className="text-xs text-muted-foreground line-clamp-2">{opt.description}</span>
                    </div>
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
