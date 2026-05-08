"use client";

import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useOnboardingContext } from "@/components/onboarding/context";
import { SIGNAL_OPTIONS } from "@/components/onboarding/signal-options";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { useUserContext } from "@/contexts/user-context";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

interface ProjectSignalRow {
  id: string;
  name: string;
}

interface WorkspaceReportRow {
  id: string;
  targets: { id: string; type: string; email: string | null }[];
}

interface UseOnboardingActions {
  isSubmitting: boolean;
  createWorkspace: () => Promise<{ workspaceId: string; projectId: string } | null>;
  saveSignals: () => Promise<boolean>;
  saveNotifications: () => Promise<boolean>;
  recordSlackStep: () => Promise<void>;
  finishFreeTier: () => Promise<boolean>;
  beginSubmitting: () => void;
  endSubmitting: () => void;
}

const persistOnboardingStep = async (
  workspaceId: string | null,
  projectId: string | null,
  step: number
): Promise<void> => {
  try {
    await fetch("/api/onboarding/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, projectId, step }),
    });
  } catch {
    // Cookie persistence is best-effort — the user can keep going.
  }
};

// Returns true only when the server confirms the cookie was cleared. A non-2xx
// response (e.g. 401 on session expiry) resolves the fetch promise normally,
// so callers that rely on `fetch` throwing would navigate into the
// (authenticated) tree with the cookie still live — the layout gate would
// bounce back to /onboarding, creating a redirect loop. Consumers MUST gate
// navigation on this boolean.
const clearOnboardingStateCookie = async (): Promise<boolean> => {
  try {
    const res = await fetch("/api/onboarding/state", { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
};

export function useOnboardingActions(): UseOnboardingActions {
  const { resources, setResources } = useOnboardingContext();
  const user = useUserContext();
  const { toast } = useToast();
  const form = useFormContext<OnboardingFormValues>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createWorkspace = useCallback(async () => {
    const valid = await form.trigger(["workspaceName", "projectName"]);
    if (!valid) return null;

    if (resources.workspaceId && resources.projectId) {
      return { workspaceId: resources.workspaceId, projectId: resources.projectId };
    }

    const data = form.getValues();
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
        toast({ variant: "destructive", title: err?.error ?? "Failed to create workspace" });
        return null;
      }
      const json = (await res.json()) as { id: string; projectId?: string };
      if (!json.projectId) {
        toast({ variant: "destructive", title: "Workspace created without a project" });
        return null;
      }
      track("onboarding", "first_project_created");
      setResources({ workspaceId: json.id, projectId: json.projectId });
      await persistOnboardingStep(json.id, json.projectId, 1);
      return { workspaceId: json.id, projectId: json.projectId };
    } catch {
      toast({ variant: "destructive", title: "Something went wrong" });
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resources.projectId, resources.workspaceId, setResources, toast]);

  // Reconciles the user's signal selection against the project's existing
  // signals: creates anything newly-selected, deletes anything that was
  // previously created from a template but is now unchecked. Failure Detector
  // is auto-created during workspace creation, so we never re-create it but
  // we DO allow deleting it if the user unchecks it.
  const saveSignals = useCallback(async (): Promise<boolean> => {
    const projectId = resources.projectId;
    if (!projectId) return true;

    const selected = new Set(form.getValues("selectedSignalIds"));
    const templateNames = new Set(SIGNAL_OPTIONS.map((opt) => opt.id));

    const baselineFailureToast = () =>
      toast({
        variant: "destructive",
        title: "Couldn't load your current signals",
        description: "Please try again.",
      });

    setIsSubmitting(true);
    try {
      // Reconcile requires an accurate baseline. Silently falling back to
      // `existing = []` on GET failure would treat the auto-created
      // Failure Detector (and any previously-saved templates on resume) as
      // missing, so the reconcile would re-POST them — producing duplicate
      // signals or 4xx errors and a misleading "some weren't saved" toast
      // even though everything already exists. Return `false` instead so
      // the caller (`signals-step.tsx`, which only advances on `ok`) keeps
      // the user on this step to retry.
      let existing: ProjectSignalRow[];
      try {
        const res = await fetch(`/api/projects/${projectId}/signals?pageNumber=0&pageSize=200`);
        if (!res.ok) {
          baselineFailureToast();
          return false;
        }
        const json = (await res.json()) as { items?: ProjectSignalRow[] };
        existing = json.items ?? [];
      } catch {
        baselineFailureToast();
        return false;
      }
      const existingByName = new Map(existing.map((s) => [s.name, s]));

      const toCreate = SIGNAL_OPTIONS.filter((opt) => selected.has(opt.id) && !existingByName.has(opt.name));
      const toDelete = existing.filter((s) => templateNames.has(s.name) && !selected.has(s.name));

      const [createResults, deleteResults] = await Promise.all([
        Promise.all(
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
                body: JSON.stringify({ name: opt.name, prompt: opt.prompt, structuredOutput }),
              });
              return res.ok;
            } catch {
              return false;
            }
          })
        ),
        Promise.all(
          toDelete.map(async (s) => {
            try {
              const res = await fetch(`/api/projects/${projectId}/signals`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [s.id] }),
              });
              return res.ok;
            } catch {
              return false;
            }
          })
        ),
      ]);

      const failedCreates = createResults.filter((ok) => !ok).length;
      const failedDeletes = deleteResults.filter((ok) => !ok).length;
      if (failedCreates > 0 || failedDeletes > 0) {
        toast({
          variant: "destructive",
          title: `Some signals weren't saved`,
          description: "You can adjust them later from the Signals page.",
        });
      }

      track("onboarding", "signals_selected", { count: selected.size });
      await persistOnboardingStep(resources.workspaceId, projectId, 2);
      return true;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resources.projectId, resources.workspaceId, toast]);

  // Reconciles the email-digest preference against the workspace's current
  // report targets. Opt-in adds the user's email, opt-out deletes it. Other
  // members' email targets are left untouched.
  const saveNotifications = useCallback(async (): Promise<boolean> => {
    const workspaceId = resources.workspaceId;
    if (!workspaceId) {
      track("onboarding", "notifications_configured", {
        email: form.getValues("emailNotificationsEnabled"),
      });
      return true;
    }

    const emailOn = form.getValues("emailNotificationsEnabled");
    const userEmail = user.email;

    // Session.user.email is typed as string, but OAuth providers without an
    // email scope can leave it empty. EMPTY_DEFAULTS sets the email toggle
    // to true, so without this guard we'd POST `email: ""` to every report.
    if (!userEmail) {
      track("onboarding", "notifications_configured", { email: emailOn });
      await persistOnboardingStep(workspaceId, resources.projectId, 3);
      return true;
    }

    setIsSubmitting(true);

    const failureToast = () =>
      toast({
        variant: "destructive",
        title: "Couldn't update email notifications",
        description: "You can change this later from workspace settings.",
      });

    try {
      // Gate track + persistOnboardingStep on the GET succeeding. `fetch`
      // resolves on any HTTP status, so without this a 500/403 would toast
      // failure and then still record `notifications_configured` + advance
      // the server-side step cursor — corrupting the metric and desyncing
      // resume state (a later resume would land on step 4 despite zero
      // reconcile having happened). Return false so the caller does NOT
      // advance the wizard UI either: advancing without persisting step 3
      // means the NEXT step's persist (`recordSlackStep` writes step 4)
      // silently skips notifications on resume. The `catch` branch below
      // mirrors this: network errors and non-2xx responses must behave
      // identically.
      const res = await fetch(`/api/workspaces/${workspaceId}/reports`, { method: "GET" });
      if (!res.ok) {
        failureToast();
        return false;
      }
      const reports = (await res.json()) as WorkspaceReportRow[];
      if (emailOn) {
        const subscribes = await Promise.all(
          reports
            .filter((r) => !r.targets.some((t) => t.type === "EMAIL" && t.email === userEmail))
            .map((r) =>
              fetch(`/api/workspaces/${workspaceId}/reports`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportId: r.id, email: userEmail }),
              })
                .then((d) => d.ok)
                .catch(() => false)
            )
        );
        if (subscribes.some((ok) => !ok)) failureToast();
      } else {
        const unsubscribes = await Promise.all(
          reports.flatMap((r) =>
            r.targets
              .filter((t) => t.type === "EMAIL" && t.email === userEmail)
              .map(() =>
                fetch(`/api/workspaces/${workspaceId}/reports`, {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reportId: r.id, email: userEmail }),
                })
                  .then((d) => d.ok)
                  .catch(() => false)
              )
          )
        );
        if (unsubscribes.some((ok) => !ok)) failureToast();
      }

      track("onboarding", "notifications_configured", { email: emailOn });
      await persistOnboardingStep(workspaceId, resources.projectId, 3);
      return true;
    } catch {
      failureToast();
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resources.projectId, resources.workspaceId, toast, user.email]);

  // Must AWAIT the step-4 POST: if this fires-and-forgets, advancing to the
  // plan step and clicking Finish races the in-flight POST against the DELETE.
  // The POST can land last, re-setting the cookie via Set-Cookie, and the
  // (authenticated) gate then bounces the user straight back to /onboarding.
  const recordSlackStep = useCallback(async (): Promise<void> => {
    const connected = form.getValues("slackConnected");
    track("onboarding", "slack_step_completed", { connected });
    setIsSubmitting(true);
    try {
      await persistOnboardingStep(resources.workspaceId, resources.projectId, 4);
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resources.projectId, resources.workspaceId]);

  // Toggle isSubmitting so the plan step's Finish button disables while the
  // cookie DELETE is in flight. Without this the user can double-click
  // Finish, fire two DELETEs, and cause a duplicate navigation.
  //
  // Returns the DELETE's success. Callers MUST NOT navigate into the
  // (authenticated) tree on false — the cookie is still live, the layout
  // gate would bounce back to /onboarding and loop.
  const finishFreeTier = useCallback(async (): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      const ok = await clearOnboardingStateCookie();
      if (!ok) {
        toast({
          variant: "destructive",
          title: "Couldn't finish onboarding",
          description: "Please try again.",
        });
        return false;
      }
      // Fire `completed` only after the DELETE confirms. Firing before the
      // gate would inflate the metric on every failed retry: each click
      // toasts + re-fires the event without the user actually completing.
      track("onboarding", "completed", { tier: form.getValues("selectedTier") });
      return true;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, toast]);

  // Paid-tier branch: plan step awaits a DELETE before window.location.href
  // navigates to Stripe. Expose a submitting toggle so the button can disable
  // during that window and prevent duplicate navigations / racing DELETEs.
  const beginSubmitting = useCallback(() => setIsSubmitting(true), []);
  const endSubmitting = useCallback(() => setIsSubmitting(false), []);

  return {
    isSubmitting,
    createWorkspace,
    saveSignals,
    saveNotifications,
    recordSlackStep,
    finishFreeTier,
    beginSubmitting,
    endSubmitting,
  };
}
