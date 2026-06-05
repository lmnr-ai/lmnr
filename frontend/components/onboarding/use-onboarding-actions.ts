"use client";

import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useOnboardingContext } from "@/components/onboarding/context";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

export interface CreateWorkspaceOptions {
  // Cloud-only: server-side seed defaults + write resume cookie. OSS leaves off.
  isCloud?: boolean;
}

interface UseOnboardingActions {
  isSubmitting: boolean;
  createWorkspace: (options?: CreateWorkspaceOptions) => Promise<{ workspaceId: string; projectId: string } | null>;
  saveSignals: () => Promise<boolean>;
  saveSlack: () => Promise<boolean>;
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

const persistOnboardingStep = (projectId: string, step: number) =>
  requestOk(`/api/projects/${projectId}/onboarding/state`, jsonRequest("POST", { step }));

export function useOnboardingActions(): UseOnboardingActions {
  const { resources, setResources } = useOnboardingContext();
  const { toast } = useToast();
  const form = useFormContext<OnboardingFormValues>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const errorToast = useCallback(
    (title: string, description?: string) => toast({ variant: "destructive", title, description }),
    [toast]
  );

  const createWorkspace = useCallback(
    async ({ isCloud = false }: CreateWorkspaceOptions = {}) => {
      if (!(await form.trigger(["workspaceName", "projectName"]))) return null;

      setIsSubmitting(true);
      try {
        let workspaceId = resources.workspaceId;
        let projectId = resources.projectId;

        // Skip server-side creation on retry, but still re-attempt the cookie write below.
        if (!workspaceId || !projectId) {
          const { workspaceName, projectName } = form.getValues();
          const res = await fetch(
            "/api/workspaces",
            jsonRequest("POST", {
              name: workspaceName.trim(),
              projectName: projectName.trim(),
            })
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
          workspaceId = json.id;
          projectId = json.projectId;
          setResources({ workspaceId, projectId });
        }

        // Cookie only matters when more wizard steps follow.
        if (isCloud) {
          const persisted = await persistOnboardingStep(projectId, 1);
          if (!persisted) {
            errorToast("Couldn't save your progress", "Please try again.");
            return null;
          }
        }
        return { workspaceId, projectId };
      } catch {
        errorToast("Something went wrong");
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, resources.projectId, resources.workspaceId, setResources, errorToast]
  );

  const saveSignals = useCallback(async (): Promise<boolean> => {
    const projectId = resources.projectId;
    if (!projectId) return true;

    const templateNames = form.getValues("selectedTemplateNames");
    setIsSubmitting(true);
    try {
      const ok = await requestOk(`/api/projects/${projectId}/signals`, jsonRequest("PUT", { templateNames }));
      if (!ok) {
        errorToast("Couldn't save your signals", "Please try again.");
        return false;
      }
      const persisted = await persistOnboardingStep(projectId, 2);
      if (!persisted) {
        errorToast("Couldn't save your progress", "Please try again.");
        return false;
      }
      track("onboarding", "signals_selected", { count: templateNames.length });
      return true;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resources.projectId, errorToast]);

  const saveSlack = useCallback(async (): Promise<boolean> => {
    const { projectId } = resources;
    if (!projectId) {
      track("onboarding", "slack_step_completed", { slackConnected: form.getValues("slackConnected") });
      return true;
    }
    setIsSubmitting(true);
    try {
      const persisted = await persistOnboardingStep(projectId, 3);
      if (!persisted) {
        errorToast("Couldn't save your progress", "Please try again.");
        return false;
      }
      track("onboarding", "slack_step_completed", { slackConnected: form.getValues("slackConnected") });
      return true;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resources, errorToast]);

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
    saveSignals,
    saveSlack,
    finishOnboarding,
    beginSubmitting,
    endSubmitting,
  };
}
