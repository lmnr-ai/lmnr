"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import NotificationsStep from "@/components/onboarding/steps/notifications-step";
import PlanStep from "@/components/onboarding/steps/plan-step";
import SignalsStep, { SIGNAL_OPTIONS } from "@/components/onboarding/steps/signals-step";
import SlackStep from "@/components/onboarding/steps/slack-step";
import WorkspaceStep from "@/components/onboarding/steps/workspace-step";
import { ONBOARDING_STEPS, type OnboardingFormValues } from "@/components/onboarding/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

const TOTAL_STEPS = ONBOARDING_STEPS.length;

interface OnboardingWizardProps {
  userName?: string | null;
  userEmail?: string | null;
  slackClientId?: string;
  slackRedirectUri?: string;
  slackFeatureEnabled: boolean;
  subscriptionEnabled: boolean;
  resumeState: {
    workspaceId: string;
    projectId: string;
    step: number;
  } | null;
}

export default function OnboardingWizard({
  userName,
  userEmail,
  slackClientId,
  slackRedirectUri,
  slackFeatureEnabled,
  subscriptionEnabled,
  resumeState,
}: OnboardingWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [stepIndex, setStepIndex] = useState(resumeState?.step ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdIds, setCreatedIds] = useState<{ workspaceId?: string; projectId?: string }>({
    workspaceId: resumeState?.workspaceId,
    projectId: resumeState?.projectId,
  });

  const form = useForm<OnboardingFormValues>({
    defaultValues: {
      workspaceName: userName ? `${userName}'s workspace` : "",
      projectName: "",
      selectedSignalIds: ["Failure Detector"],
      emailNotificationsEnabled: true,
      slackConnected: searchParams.get("slack") === "success",
      selectedTier: "free",
    },
    mode: "onChange",
  });

  useEffect(() => {
    track("onboarding", "page_viewed");
  }, []);

  // Handle slack OAuth return: lift flag into form state and strip the query param.
  useEffect(() => {
    const slackResult = searchParams.get("slack");
    if (slackResult === "success") {
      form.setValue("slackConnected", true);
      toast({ title: "Slack connected", description: "You'll receive signal alerts in Slack." });
    } else if (slackResult === "error") {
      toast({
        variant: "destructive",
        title: "Slack connection failed",
        description: "Please try again or skip for now.",
      });
    }
    if (slackResult) {
      const params = new URLSearchParams(searchParams);
      params.delete("slack");
      const query = params.toString();
      router.replace(`/onboarding${query ? `?${query}` : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistState = useCallback(async (workspaceId: string, projectId: string, step: number) => {
    try {
      await fetch("/api/onboarding/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, projectId, step }),
      });
    } catch {
      // Cookie persistence is best-effort.
    }
  }, []);

  const handleGoBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleCreateWorkspace = form.handleSubmit(async (data) => {
    if (createdIds.workspaceId && createdIds.projectId) {
      setStepIndex(1);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.workspaceName.trim(),
          projectName: data.projectName.trim(),
          isFirstProject: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast({
          variant: "destructive",
          title: err?.error ?? "Failed to create workspace",
        });
        return;
      }
      const json = (await res.json()) as { id: string; name: string; projectId?: string };
      if (!json.projectId) {
        toast({ variant: "destructive", title: "Workspace created without a project" });
        return;
      }
      track("onboarding", "first_project_created");
      setCreatedIds({ workspaceId: json.id, projectId: json.projectId });
      await persistState(json.id, json.projectId, 1);
      setStepIndex(1);
    } catch {
      toast({ variant: "destructive", title: "Something went wrong" });
    } finally {
      setIsSubmitting(false);
    }
  });

  const handleSaveSignals = useCallback(async () => {
    const projectId = createdIds.projectId;
    if (!projectId) {
      setStepIndex(2);
      return;
    }
    const selected = form.getValues("selectedSignalIds");
    const failureAlreadyCreated = true; // createWorkspace auto-creates the Failure Detector signal.
    const toCreate = SIGNAL_OPTIONS.filter((opt) => {
      if (!selected.includes(opt.id)) return false;
      if (failureAlreadyCreated && opt.id === "Failure Detector") return false;
      return true;
    });

    setIsSubmitting(true);
    try {
      await Promise.all(
        toCreate.map((opt) => {
          let structuredOutput: Record<string, unknown> = {};
          try {
            structuredOutput = JSON.parse(opt.structuredOutputSchema);
          } catch {
            structuredOutput = {};
          }
          return fetch(`/api/projects/${projectId}/signals`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: opt.name,
              prompt: opt.prompt,
              structuredOutput,
            }),
          }).catch(() => null);
        })
      );
      track("onboarding", "signals_selected", { count: selected.length });
      if (createdIds.workspaceId) {
        await persistState(createdIds.workspaceId, projectId, 2);
      }
      setStepIndex(2);
    } finally {
      setIsSubmitting(false);
    }
  }, [createdIds, form, persistState]);

  const handleSaveNotifications = useCallback(async () => {
    const workspaceId = createdIds.workspaceId;
    const emailOn = form.getValues("emailNotificationsEnabled");
    if (workspaceId && !emailOn && userEmail) {
      setIsSubmitting(true);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/reports`, { method: "GET" });
        if (res.ok) {
          const reports = (await res.json()) as {
            id: string;
            targets: { id: string; type: string; email: string | null }[];
          }[];
          await Promise.all(
            reports.flatMap((r) =>
              r.targets
                .filter((t) => t.type === "EMAIL" && t.email === userEmail)
                .map(() =>
                  fetch(`/api/workspaces/${workspaceId}/reports`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reportId: r.id, email: userEmail }),
                  }).catch(() => null)
                )
            )
          );
        }
      } finally {
        setIsSubmitting(false);
      }
    }
    track("onboarding", "notifications_configured", { email: emailOn });
    if (workspaceId && createdIds.projectId) {
      await persistState(workspaceId, createdIds.projectId, 3);
    }
    setStepIndex(3);
  }, [createdIds, form, persistState, userEmail]);

  const handleSlackNext = useCallback(async () => {
    const connected = form.getValues("slackConnected");
    track("onboarding", "slack_step_completed", { connected });
    if (createdIds.workspaceId && createdIds.projectId) {
      await persistState(createdIds.workspaceId, createdIds.projectId, 4);
    }
    setStepIndex(4);
  }, [createdIds, form, persistState]);

  const finishOnboarding = useCallback(async () => {
    const projectId = createdIds.projectId;
    track("onboarding", "completed", { tier: form.getValues("selectedTier") });
    try {
      await fetch("/api/onboarding/state", { method: "DELETE" });
    } catch {
      // ignore
    }
    if (projectId) {
      router.push(`/project/${projectId}/traces?onboarding=true`);
    } else {
      router.push("/projects");
    }
  }, [createdIds, form, router]);

  return (
    <FormProvider {...form}>
      {stepIndex === 0 && (
        <WorkspaceStep
          stepIndex={0}
          totalSteps={TOTAL_STEPS}
          onNext={handleCreateWorkspace}
          isSubmitting={isSubmitting}
        />
      )}
      {stepIndex === 1 && (
        <SignalsStep
          stepIndex={1}
          totalSteps={TOTAL_STEPS}
          onNext={handleSaveSignals}
          onBack={handleGoBack}
          isSubmitting={isSubmitting}
        />
      )}
      {stepIndex === 2 && (
        <NotificationsStep
          stepIndex={2}
          totalSteps={TOTAL_STEPS}
          userEmail={userEmail}
          onNext={handleSaveNotifications}
          onBack={handleGoBack}
          isSubmitting={isSubmitting}
        />
      )}
      {stepIndex === 3 && (
        <SlackStep
          stepIndex={3}
          totalSteps={TOTAL_STEPS}
          workspaceId={createdIds.workspaceId}
          slackClientId={slackClientId}
          slackRedirectUri={slackRedirectUri}
          slackFeatureEnabled={slackFeatureEnabled}
          onNext={handleSlackNext}
          onBack={handleGoBack}
          isSubmitting={isSubmitting}
        />
      )}
      {stepIndex === 4 && (
        <PlanStep
          stepIndex={4}
          totalSteps={TOTAL_STEPS}
          workspaceId={createdIds.workspaceId}
          workspaceName={form.getValues("workspaceName")}
          subscriptionEnabled={subscriptionEnabled}
          onNext={finishOnboarding}
          onBack={handleGoBack}
          isSubmitting={isSubmitting}
        />
      )}
    </FormProvider>
  );
}
