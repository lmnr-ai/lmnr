"use client";

import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useOnboardingContext } from "@/components/onboarding/context";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { useUserContext } from "@/contexts/user-context";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

interface UseOnboardingActions {
  isSubmitting: boolean;
  createWorkspace: () => Promise<{ workspaceId: string; projectId: string } | null>;
  saveSignals: () => Promise<boolean>;
  saveNotifications: () => Promise<boolean>;
  finishFreeTier: () => Promise<boolean>;
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
  const user = useUserContext();
  const { toast } = useToast();
  const form = useFormContext<OnboardingFormValues>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const errorToast = useCallback(
    (title: string, description?: string) => toast({ variant: "destructive", title, description }),
    [toast]
  );

  const createWorkspace = useCallback(async () => {
    if (!(await form.trigger(["workspaceName", "projectName"]))) return null;
    if (resources.workspaceId && resources.projectId) {
      return { workspaceId: resources.workspaceId, projectId: resources.projectId };
    }

    const { workspaceName, projectName } = form.getValues();
    setIsSubmitting(true);
    try {
      const res = await fetch(
        "/api/workspaces",
        jsonRequest("POST", {
          name: workspaceName.trim(),
          projectName: projectName.trim(),
          isFirstProject: true,
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
      setResources({ workspaceId: json.id, projectId: json.projectId });
      await persistOnboardingStep(json.projectId, 1);
      return { workspaceId: json.id, projectId: json.projectId };
    } catch {
      errorToast("Something went wrong");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resources.projectId, resources.workspaceId, setResources, errorToast]);

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
      track("onboarding", "signals_selected", { count: templateNames.length });
      await persistOnboardingStep(projectId, 2);
      return true;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resources.projectId, errorToast]);

  const saveNotifications = useCallback(async (): Promise<boolean> => {
    const { workspaceId, projectId } = resources;
    const subscribedReportIds = form.getValues("subscribedReportIds");
    const slackConnected = form.getValues("slackConnected");
    const trackEvent = () =>
      track("onboarding", "notifications_configured", {
        slackConnected,
        subscribedReportCount: subscribedReportIds.length,
      });

    // OAuth without an email scope leaves session.user.email empty — skip the
    // reconcile rather than POST `email: ""`.
    if (!workspaceId || !projectId || !user.email) {
      trackEvent();
      if (projectId) await persistOnboardingStep(projectId, 3);
      return true;
    }

    setIsSubmitting(true);
    try {
      const ok = await requestOk(`/api/workspaces/${workspaceId}/reports`, jsonRequest("PUT", { subscribedReportIds }));
      if (!ok) {
        errorToast("Couldn't update email notifications", "You can change this later from workspace settings.");
        return false;
      }
      trackEvent();
      await persistOnboardingStep(projectId, 3);
      return true;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resources, errorToast, user.email]);

  const finishFreeTier = useCallback(async (): Promise<boolean> => {
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
    saveNotifications,
    finishFreeTier,
    beginSubmitting,
    endSubmitting,
  };
}
