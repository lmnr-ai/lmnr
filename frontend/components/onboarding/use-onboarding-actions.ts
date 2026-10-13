"use client";

import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useOnboardingContext } from "@/components/onboarding/context";
import { type OnboardingFormValues, stepIndexOf } from "@/components/onboarding/types";
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
  savePlan: (isPaid: boolean) => Promise<boolean>;
  saveInvite: (emails: string[]) => Promise<boolean>;
  startTrial: () => Promise<boolean>;
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
              // Server-side: seed Failure Detector signal + email targets on default reports.
              isFirstProject: isCloud,
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
          const persisted = await persistOnboardingStep(projectId, stepIndexOf("plan"));
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
      const persisted = await persistOnboardingStep(projectId, stepIndexOf("slack"));
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
      const persisted = await persistOnboardingStep(projectId, stepIndexOf("connect"));
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

  const savePlan = useCallback(
    async (isPaid: boolean): Promise<boolean> => {
      const projectId = resources.projectId;
      if (!projectId) return true;
      setIsSubmitting(true);
      try {
        const persisted = await persistOnboardingStep(projectId, stepIndexOf(isPaid ? "invite" : "connect"));
        if (!persisted) {
          errorToast("Couldn't save your progress", "Please try again.");
          return false;
        }
        track("onboarding", "plan_step_completed", { tier: form.getValues("selectedTier") });
        return true;
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, resources.projectId, errorToast]
  );

  // Best-effort per email: one bad address shouldn't block the rest or the wizard.
  const saveInvite = useCallback(
    async (emails: string[]): Promise<boolean> => {
      const { workspaceId, projectId } = resources;
      if (!workspaceId || !projectId) return true;
      setIsSubmitting(true);
      try {
        const results = await Promise.all(
          emails.map(async (email) => {
            try {
              const res = await fetch(`/api/workspaces/${workspaceId}/invite`, jsonRequest("POST", { email }));
              if (res.ok) return null;
              const err = await res.json().catch(() => null);
              return `${email}: ${err?.error ?? "failed to invite"}`;
            } catch {
              return `${email}: failed to invite`;
            }
          })
        );
        const failures = results.filter((r): r is string => r !== null);
        if (failures.length > 0) {
          errorToast("Some invites weren't sent", failures.join("\n"));
        }
        const persisted = await persistOnboardingStep(projectId, stepIndexOf("signals"));
        if (!persisted) {
          errorToast("Couldn't save your progress", "Please try again.");
          return false;
        }
        track("onboarding", "team_invited", { count: emails.length - failures.length });
        return true;
      } finally {
        setIsSubmitting(false);
      }
    },
    [resources, errorToast]
  );

  const startTrial = useCallback(async (): Promise<boolean> => {
    const workspaceId = resources.workspaceId;
    if (!workspaceId) return false;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/subscription/trial`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        errorToast("Couldn't start your free trial", err?.error ?? "Please try again.");
        return false;
      }
      form.setValue("currentTier", "hobby");
      track("onboarding", "trial_started");
      return true;
    } catch {
      errorToast("Couldn't start your free trial", "Please try again.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resources.workspaceId, errorToast]);

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
    savePlan,
    saveInvite,
    startTrial,
    finishOnboarding,
    beginSubmitting,
    endSubmitting,
  };
}
