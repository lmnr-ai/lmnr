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
  const [createdSignalIds, setCreatedSignalIds] = useState<Set<string>>(new Set());
  // Report IDs the user has opted OUT of during this session, tracked so we
  // can re-opt-in if they toggle the email checkbox back on before advancing.
  const [optedOutReportIds, setOptedOutReportIds] = useState<Set<string>>(new Set());

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
    // createWorkspace auto-creates the Failure Detector signal, and previous
    // visits to this step may have already created others — skip both.
    const toCreate = SIGNAL_OPTIONS.filter(
      (opt) => selected.includes(opt.id) && opt.id !== "Failure Detector" && !createdSignalIds.has(opt.id)
    );

    setIsSubmitting(true);
    try {
      const results = await Promise.all(
        toCreate.map(async (opt) => {
          let structuredOutput: Record<string, unknown> = {};
          try {
            structuredOutput = JSON.parse(opt.structuredOutputSchema);
          } catch {
            structuredOutput = {};
          }
          try {
            const res = await fetch(`/api/projects/${projectId}/signals`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: opt.name,
                prompt: opt.prompt,
                structuredOutput,
              }),
            });
            return { id: opt.id, ok: res.ok };
          } catch {
            return { id: opt.id, ok: false };
          }
        })
      );
      const created = results.filter((r) => r.ok).map((r) => r.id);
      if (created.length > 0) {
        setCreatedSignalIds((prev) => {
          const next = new Set(prev);
          created.forEach((id) => next.add(id));
          return next;
        });
      }
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        toast({
          variant: "destructive",
          title: `Failed to create ${failed.length} signal${failed.length > 1 ? "s" : ""}`,
          description: "You can create them later from the Signals page.",
        });
      }
      track("onboarding", "signals_selected", { count: selected.length });
      if (createdIds.workspaceId) {
        await persistState(createdIds.workspaceId, projectId, 2);
      }
      setStepIndex(2);
    } finally {
      setIsSubmitting(false);
    }
  }, [createdIds, createdSignalIds, form, persistState, toast]);

  const handleSaveNotifications = useCallback(async () => {
    const workspaceId = createdIds.workspaceId;
    const emailOn = form.getValues("emailNotificationsEnabled");
    if (workspaceId && userEmail) {
      setIsSubmitting(true);
      // Opting out/in of email is nice-to-have — toast on failure but let the
      // user continue so they don't get stuck on this step.
      const failureToast = () =>
        toast({
          variant: "destructive",
          title: "Could not update email notifications",
          description: "You can change this later from workspace settings.",
        });
      try {
        if (!emailOn) {
          const res = await fetch(`/api/workspaces/${workspaceId}/reports`, { method: "GET" });
          if (!res.ok) {
            failureToast();
          } else {
            const reports = (await res.json()) as {
              id: string;
              targets: { id: string; type: string; email: string | null }[];
            }[];
            const toOptOut = reports.filter((r) => r.targets.some((t) => t.type === "EMAIL" && t.email === userEmail));
            const results = await Promise.all(
              toOptOut.map((r) =>
                fetch(`/api/workspaces/${workspaceId}/reports`, {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reportId: r.id, email: userEmail }),
                })
                  .then((del) => ({ reportId: r.id, ok: del.ok }))
                  .catch(() => ({ reportId: r.id, ok: false }))
              )
            );
            const succeeded = results.filter((r) => r.ok).map((r) => r.reportId);
            if (succeeded.length > 0) {
              setOptedOutReportIds((prev) => {
                const next = new Set(prev);
                succeeded.forEach((id) => next.add(id));
                return next;
              });
            }
            if (results.some((r) => !r.ok)) {
              failureToast();
            }
          }
        } else if (optedOutReportIds.size > 0) {
          // User re-checked the box after previously opting out this session;
          // re-subscribe so the auto-created targets come back.
          const results = await Promise.all(
            Array.from(optedOutReportIds).map((reportId) =>
              fetch(`/api/workspaces/${workspaceId}/reports`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportId, email: userEmail }),
              })
                .then((res) => ({ reportId, ok: res.ok }))
                .catch(() => ({ reportId, ok: false }))
            )
          );
          const succeeded = results.filter((r) => r.ok).map((r) => r.reportId);
          if (succeeded.length > 0) {
            setOptedOutReportIds((prev) => {
              const next = new Set(prev);
              succeeded.forEach((id) => next.delete(id));
              return next;
            });
          }
          if (results.some((r) => !r.ok)) {
            failureToast();
          }
        }
      } catch {
        failureToast();
      } finally {
        setIsSubmitting(false);
      }
    }
    track("onboarding", "notifications_configured", { email: emailOn });
    if (workspaceId && createdIds.projectId) {
      await persistState(workspaceId, createdIds.projectId, 3);
    }
    setStepIndex(3);
  }, [createdIds, form, optedOutReportIds, persistState, toast, userEmail]);

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
