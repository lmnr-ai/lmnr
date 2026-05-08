"use client";

import { Mail } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";

import StepShell from "@/components/onboarding/step-shell";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { Checkbox } from "@/components/ui/checkbox";

interface NotificationsStepProps {
  stepIndex: number;
  totalSteps: number;
  userEmail?: string | null;
  onNext: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export default function NotificationsStep({
  stepIndex,
  totalSteps,
  userEmail,
  onNext,
  onBack,
  isSubmitting,
}: NotificationsStepProps) {
  const { control } = useFormContext<OnboardingFormValues>();

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Set up notifications"
      description="Decide how you want to hear about the signals you just set up."
      onNext={onNext}
      onBack={onBack}
      isSubmitting={isSubmitting}
    >
      <Controller
        name="emailNotificationsEnabled"
        control={control}
        render={({ field }) => (
          <label
            htmlFor="email-notifications"
            className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3 cursor-pointer"
          >
            <Checkbox
              id="email-notifications"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              className="mt-0.5"
            />
            <div className="flex flex-col gap-0.5 flex-1">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-secondary-foreground">Email</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Weekday and weekly digests of signal events delivered to{" "}
                <span className="font-medium text-foreground">{userEmail ?? "your email"}</span>.
              </span>
            </div>
          </label>
        )}
      />

      <p className="text-xs text-muted-foreground">
        You can always tweak notification targets for each signal later from the project settings.
      </p>
    </StepShell>
  );
}
