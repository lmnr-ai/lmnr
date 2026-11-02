import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { confirmCheckoutSession } from "@/lib/actions/checkout/confirm";
import { startStarterTrial } from "@/lib/actions/checkout/trial";
import { getOnboardingState, setOnboardingState } from "@/lib/actions/onboarding";
import {
  type CommitOnboardingResult,
  ONBOARDING_COOKIE_VERSION,
  type OnboardingPending,
  OnboardingPendingSchema,
  type OnboardingState,
} from "@/lib/actions/onboarding/types";
import { setTemplateSignals } from "@/lib/actions/signals";
import { isFreeTierWorkspace } from "@/lib/actions/usage/utils";
import { inviteUserToWorkspace } from "@/lib/actions/workspace/invite";
import { createWorkspace } from "@/lib/actions/workspaces";
import { getServerSession } from "@/lib/auth-session";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";

export const StartOnboardingSchema = z.object({
  workspaceName: z.string().trim().min(1).max(200),
  projectName: z.string().trim().min(1).max(200),
});

export const CommitOnboardingSchema = OnboardingPendingSchema.extend({
  // "trial" starts the Starter trial unless the workspace is already past Free (a legacy onboarding
  // checkout); "free" is for owners who can't start one.
  plan: z.enum(["trial", "free"]),
});

const isOwnOnboarding = async (state: OnboardingState | null, userId: string): Promise<boolean> => {
  if (state?.userId !== userId) return false;
  const membership = await db.query.membersOfWorkspaces.findFirst({
    where: and(eq(membersOfWorkspaces.workspaceId, state.workspaceId), eq(membersOfWorkspaces.userId, userId)),
    columns: { id: true },
  });
  return !!membership;
};

// Creates the workspace and project after the first step. A repeat submit (double click, a second
// tab) reuses the one already in the cookie.
export const startOnboarding = async (
  input: z.infer<typeof StartOnboardingSchema>
): Promise<{ workspaceId: string; projectId: string }> => {
  const session = await getServerSession();
  if (!session?.user) throw new Error("Unauthorized");
  const { workspaceName, projectName } = StartOnboardingSchema.parse(input);

  const existing = await getOnboardingState();
  if (existing && (await isOwnOnboarding(existing, session.user.id))) {
    return { workspaceId: existing.workspaceId, projectId: existing.projectId };
  }
  const created = await createWorkspace({ name: workspaceName, projectName, isFirstProject: true });
  const workspaceId = created.id;
  const projectId = created.projectId!;
  await setOnboardingState({
    v: ONBOARDING_COOKIE_VERSION,
    userId: session.user.id,
    workspaceId,
    projectId,
    step: "invite",
    startedAt: Date.now(),
  });
  return { workspaceId, projectId };
};

// Invites are best-effort per address; a failure is reported, never blocks the rest.
const applyOnboardingSelections = async ({
  workspaceId,
  projectId,
  pending,
  userEmail,
}: {
  workspaceId: string;
  projectId: string;
  pending: OnboardingPending;
  userEmail: string;
}): Promise<string[]> => {
  const failedInvites: string[] = [];
  for (const email of pending.invites) {
    try {
      await inviteUserToWorkspace({ workspaceId, email });
    } catch (e) {
      console.error(`Onboarding invite to ${email} failed`, e);
      failedInvites.push(email);
    }
  }
  if (pending.templateNames.length > 0) {
    try {
      await setTemplateSignals({ projectId, templateNames: pending.templateNames, subscriberEmail: userEmail });
    } catch (e) {
      console.error(`Onboarding signals for project ${projectId} failed`, e);
    }
  }
  return failedInvites;
};

export const commitOnboarding = async (
  input: z.infer<typeof CommitOnboardingSchema>
): Promise<CommitOnboardingResult> => {
  const session = await getServerSession();
  if (!session?.user) throw new Error("Unauthorized");
  const { invites, templateNames, plan } = CommitOnboardingSchema.parse(input);

  const state = await getOnboardingState();
  if (!state || !(await isOwnOnboarding(state, session.user.id))) {
    throw new Error("No onboarding in progress. Please refresh and try again.");
  }
  const { workspaceId, projectId } = state;
  const pending = { invites, templateNames };

  // Free has one seat and no Signals, so the queued invites and templates aren't applied. They stay
  // pending in case the user goes back and commits again.
  if (plan === "free") {
    await setOnboardingState({ ...state, step: "connect", pending });
    return { workspaceId, projectId, failedInvites: [] };
  }

  // Saved before anything that can fail, so a retry still has the choices.
  await setOnboardingState({ ...state, step: "slack", pending });

  // A retry after the trial already started finds the workspace off Free and skips straight on.
  if (await isFreeTierWorkspace(workspaceId)) {
    await startStarterTrial({ workspaceId, source: "onboarding" });
  }
  const failedInvites = await applyOnboardingSelections({
    workspaceId,
    projectId,
    pending,
    userEmail: session.user.email,
  });
  const { pending: _applied, ...rest } = state;
  await setOnboardingState({ ...rest, step: "connect" });
  return { workspaceId, projectId, failedInvites };
};

// Stripe's success_url for legacy onboarding checkouts. Applies the plan, then the queued choices.
// Anything short of a confirmed payment leaves the cookie as is.
export const completeOnboardingCheckout = async (sessionId: string): Promise<void> => {
  const session = await getServerSession();
  const state = await getOnboardingState();
  if (!session?.user || state?.userId !== session.user.id) return;

  const paid = await confirmCheckoutSession({ sessionId, workspaceId: state.workspaceId });
  if (!paid) return;

  if (state.pending) {
    await applyOnboardingSelections({
      workspaceId: state.workspaceId,
      projectId: state.projectId,
      pending: state.pending,
      userEmail: session.user.email,
    });
  }
  const { pending: _consumed, ...rest } = state;
  await setOnboardingState({ ...rest, step: "connect" });
};
