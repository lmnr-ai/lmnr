"use client";

import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useOnboardingContext } from "@/components/onboarding/context";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { type CommitOnboardingResult } from "@/lib/actions/onboarding/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

// "continue" is for a workspace that is already paid; "checkout" returns a Stripe URL.
export type CommitPlan =
  | { plan: "trial" }
  | { plan: "continue" }
  | { plan: "free" }
  | { plan: "checkout"; checkoutTier: "hobby" | "pro" };

interface UseOnboardingActions {
  isSubmitting: boolean;
  // Self-hosted only: creates the workspace without an onboarding cookie.
  createWorkspace: () => Promise<{ workspaceId: string; projectId: string } | null>;
  // Cloud: creates the workspace and starts the onboarding cookie.
  startOnboarding: () => Promise<boolean>;
  commitPlan: (choice: CommitPlan) => Promise<CommitOnboardingResult | null>;
  finishOnboarding: () => Promise<boolean>;
  beginSubmitting: () => void;
  endSubmitting: () => void;
}

const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const requestOk = async (input: string, init?: RequestInit): Promise<boolean> => {
  try {
    const res = await fetch(input, init);
    return res.ok;
  } catch {
    return false;
  }
};

export function useOnboardingActions(): UseOnboardingActions {
  const { resources, setResources } = useOnboardingContext();
  const { toast } = useToast();
  const form = useFormContext<OnboardingFormValues>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const errorToast = useCallback(
    (title: string, description?: string) => toast({ variant: "destructive", title, description }),
    [toast]
  );

  const createWorkspace = useCallback(async () => {
    if (!(await form.trigger(["workspaceName", "projectName"]))) return null;

    setIsSubmitting(true);
    try {
      const { workspaceName, projectName } = form.getValues();
      const res = await fetch(
        "/api/workspaces",
        jsonRequest("POST", { name: workspaceName.trim(), projectName: projectName.trim() })
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        errorToast(err?.error ?? "Failed to create workspace");
        return null;
      }
      const json = (await res.json()) as { id: string; projectId?: string };
      if (!json.projectId) {
        errorToast("Workspace created without a project");
        return null;
      }
      track("onboarding", "first_project_created");
      setResources({ workspaceId: json.id, projectId: json.projectId });
      return { workspaceId: json.id, projectId: json.projectId };
    } catch {
      errorToast("Something went wrong");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, setResources, errorToast]);

  const startOnboarding = useCallback(async (): Promise<boolean> => {
    if (!(await form.trigger(["workspaceName", "projectName"]))) return false;

    setIsSubmitting(true);
    try {
      const { workspaceName, projectName } = form.getValues();
      const res = await fetch(
        "/api/onboarding/start",
        jsonRequest("POST", { workspaceName: workspaceName.trim(), projectName: projectName.trim() })
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        errorToast(err?.error ?? "Failed to create workspace");
        return false;
      }
      const json = (await res.json()) as { workspaceId: string; projectId: string };
      track("onboarding", "first_project_created");
      setResources(json);
      return true;
    } catch {
      errorToast("Something went wrong");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, setResources, errorToast]);

  // For a trial, starts it and applies the queued invites and signals.
  const commitPlan = useCallback(
    async (choice: CommitPlan): Promise<CommitOnboardingResult | null> => {
      const { invites, selectedTemplateNames } = form.getValues();
      setIsSubmitting(true);
      try {
        const res = await fetch(
          "/api/onboarding/commit",
          jsonRequest("POST", {
            invites,
            templateNames: selectedTemplateNames,
            ...choice,
          })
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          errorToast("Couldn't set up your workspace", err?.error ?? "Please try again.");
          return null;
        }
        const result = (await res.json()) as CommitOnboardingResult;
        if (choice.plan === "trial") form.setValue("currentTier", form.getValues("selectedTier"));
        if (result.failedInvites.length > 0) {
          errorToast("Some invites weren't sent", result.failedInvites.join(", "));
        }
        track("onboarding", "plan_committed", {
          plan: choice.plan,
          tier: form.getValues("selectedTier"),
          invites: invites.length,
          signals: selectedTemplateNames.length,
        });
        return result;
      } catch {
        errorToast("Couldn't set up your workspace", "Please try again.");
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, errorToast]
  );

  const finishOnboarding = useCallback(async (): Promise<boolean> => {
    const projectId = resources.projectId;
    if (!projectId) {
      errorToast("Couldn't finish onboarding", "Please refresh and try again.");
      return false;
    }
    setIsSubmitting(true);
    try {
      const ok = await requestOk(`/api/projects/${projectId}/onboarding/state`, { method: "DELETE" });
      if (!ok) {
        errorToast("Couldn't finish onboarding", "Please try again.");
        return false;
      }
      track("onboarding", "completed", { tier: form.getValues("selectedTier") });
      return true;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, errorToast, resources.projectId]);

  const beginSubmitting = useCallback(() => setIsSubmitting(true), []);
  const endSubmitting = useCallback(() => setIsSubmitting(false), []);

  return {
    isSubmitting,
    createWorkspace,
    startOnboarding,
    commitPlan,
    finishOnboarding,
    beginSubmitting,
    endSubmitting,
  };
}
