"use client";

import { Controller, useFormContext } from "react-hook-form";

import StepShell from "@/components/onboarding/step-shell";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { useOnboardingActions } from "@/components/onboarding/use-onboarding-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface WorkspaceStepProps {
  stepIndex: number;
  totalSteps: number;
  onAdvance: () => void;
}

export default function WorkspaceStep({ stepIndex, totalSteps, onAdvance }: WorkspaceStepProps) {
  const {
    control,
    watch,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  const { isSubmitting, createWorkspace } = useOnboardingActions();

  const workspaceName = watch("workspaceName");
  const projectName = watch("projectName");
  const nextDisabled = !workspaceName?.trim() || !projectName?.trim();

  const handleNext = async () => {
    const result = await createWorkspace();
    if (result) onAdvance();
  };

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Welcome to Laminar"
      description="Let's start by creating your first workspace and project."
      onNext={handleNext}
      nextDisabled={nextDisabled}
      isSubmitting={isSubmitting}
      nextLabel="Create workspace"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workspace-name" className="text-sm font-medium">
            Workspace name
          </Label>
          <Controller
            name="workspaceName"
            control={control}
            rules={{
              required: "Workspace name is required",
              validate: (value) => value.trim().length > 0 || "Workspace name cannot be empty",
            }}
            render={({ field, fieldState }) => (
              <>
                <Input
                  {...field}
                  id="workspace-name"
                  placeholder="e.g. Acme Inc."
                  className={cn(fieldState.error && "border-destructive focus-visible:ring-destructive")}
                />
                {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
              </>
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-name" className="text-sm font-medium">
            Project name
          </Label>
          <Controller
            name="projectName"
            control={control}
            rules={{
              required: "Project name is required",
              validate: (value) => value.trim().length > 0 || "Project name cannot be empty",
            }}
            render={({ field, fieldState }) => (
              <>
                <Input
                  {...field}
                  id="project-name"
                  placeholder="e.g. My AI Agent"
                  className={cn(fieldState.error && "border-destructive focus-visible:ring-destructive")}
                />
                {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
              </>
            )}
          />
          {!errors.projectName && (
            <p className="text-xs text-muted-foreground">Projects organize your traces, signals, and evaluations.</p>
          )}
        </div>
      </div>
    </StepShell>
  );
}
