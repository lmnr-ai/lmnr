"use client";

import { Controller, useFormContext } from "react-hook-form";

import StepShell from "@/components/onboarding/step-shell";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { type CreateWorkspaceOptions, useOnboardingActions } from "@/components/onboarding/use-onboarding-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface WorkspaceStepProps extends CreateWorkspaceOptions {
  stepIndex: number;
  totalSteps: number;
  // Cloud bumps the step index; OSS routes to /projects.
  onComplete: (result: { workspaceId: string; projectId: string }) => void;
}

export default function WorkspaceStep({ stepIndex, totalSteps, isCloud = false, onComplete }: WorkspaceStepProps) {
  const { control, watch } = useFormContext<OnboardingFormValues>();
  const { isSubmitting, createWorkspace, beginSubmitting } = useOnboardingActions();

  const workspaceName = watch("workspaceName");
  const projectName = watch("projectName");
  const nextDisabled = !workspaceName?.trim() || !projectName?.trim();

  const handleNext = async () => {
    const result = await createWorkspace({ isCloud });
    if (!result) return;
    // Hold the loading state through onComplete's navigation so the button
    // can't be re-clicked while the next route mounts.
    beginSubmitting();
    onComplete(result);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (nextDisabled || isSubmitting) return;
    void handleNext();
  };

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Welcome to Laminar"
      description={
        <>
          Let&apos;s start by creating your first workspace and project.
          <br />
          Workspaces manage your team and billing. Projects hold your traces, signals, and evaluations. You can rename
          either anytime.
        </>
      }
      onNext={handleNext}
      nextDisabled={nextDisabled}
      isSubmitting={isSubmitting}
      nextLabel="Create workspace and project"
    >
      <div className="flex flex-col flex-1 gap-3" onKeyDown={handleKeyDown}>
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
        </div>
      </div>
    </StepShell>
  );
}
