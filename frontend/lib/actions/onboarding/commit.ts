import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { confirmCheckoutSession } from "@/lib/actions/checkout/confirm";
import { startStarterTrial } from "@/lib/actions/checkout/trial";
import { TIER_CONFIG } from "@/lib/actions/checkout/types";
import { clearOnboardingDraft, getOnboardingState, setOnboardingState } from "@/lib/actions/onboarding";
import {
  type CommitOnboardingResult,
  MAX_ONBOARDING_INVITES,
  ONBOARDING_COOKIE_VERSION,
  type OnboardingPending,
  type OnboardingState,
} from "@/lib/actions/onboarding/types";
import { setTemplateSignals } from "@/lib/actions/signals";
import { isFreeTierWorkspace } from "@/lib/actions/usage/utils";
import { inviteUserToWorkspace } from "@/lib/actions/workspace/invite";
import { createWorkspace } from "@/lib/actions/workspaces";
import { getServerSession } from "@/lib/auth-session";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";

export const CommitOnboardingSchema = z.object({
  workspaceName: z.string().trim().min(1),
  projectName: z.string().trim().min(1),
  invites: z.array(z.email()).max(MAX_ONBOARDING_INVITES),
  templateNames: z.array(z.string()).max(50),
  // "trial" also covers a workspace that is already paid (e.g. its checkout webhook won the race).
  plan: z.enum(["trial", "free", "checkout"]),
  checkoutTier: z.enum(["hobby", "pro"]).optional(),
});

// A cancelled checkout or a failed trial leaves the committed workspace in the cookie; a retry
// reuses it instead of creating a second one.
const ensureWorkspace = async (
  userId: string,
  existing: OnboardingState | null,
  names: { workspaceName: string; projectName: string }
): Promise<{ workspaceId: string; projectId: string }> => {
  if (existing?.userId === userId) {
    const membership = await db.query.membersOfWorkspaces.findFirst({
      where: and(eq(membersOfWorkspaces.workspaceId, existing.workspaceId), eq(membersOfWorkspaces.userId, userId)),
      columns: { id: true },
    });
    if (membership) return { workspaceId: existing.workspaceId, projectId: existing.projectId };
  }
  const created = await createWorkspace({
    name: names.workspaceName,
    projectName: names.projectName,
    isFirstProject: true,
  });
  return { workspaceId: created.id, projectId: created.projectId! };
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
  const { workspaceName, projectName, invites, templateNames, plan, checkoutTier } =
    CommitOnboardingSchema.parse(input);

  const existing = await getOnboardingState();
  const { workspaceId, projectId } = await ensureWorkspace(session.user.id, existing, { workspaceName, projectName });
  const base = {
    v: ONBOARDING_COOKIE_VERSION,
    userId: session.user.id,
    workspaceId,
    projectId,
    startedAt: existing?.userId === session.user.id ? existing.startedAt : Date.now(),
  };
  await clearOnboardingDraft();

  // Free has one seat and no Signals, so the queued invites and templates are dropped.
  if (plan === "free") {
    await setOnboardingState({ ...base, step: "connect" });
    return { workspaceId, projectId, next: "connect", failedInvites: [] };
  }

  // Saved before anything that can fail, so a retry or the Stripe return still has the choices.
  const pending = { invites, templateNames };
  await setOnboardingState({ ...base, step: "plan", pending });

  if (plan === "checkout") {
    const lookupKey = TIER_CONFIG[checkoutTier ?? "hobby"].lookupKey;
    const sp = new URLSearchParams({ lookupKey, workspaceId, workspaceName, returnTo: "onboarding" });
    return { workspaceId, projectId, next: "checkout", checkoutUrl: `/checkout?${sp}`, failedInvites: [] };
  }

  if (await isFreeTierWorkspace(workspaceId)) {
    await startStarterTrial({ workspaceId });
  }
  const failedInvites = await applyOnboardingSelections({
    workspaceId,
    projectId,
    pending,
    userEmail: session.user.email,
  });
  await setOnboardingState({ ...base, step: "slack" });
  return { workspaceId, projectId, next: "slack", failedInvites };
};

// Stripe's success_url for onboarding checkouts. Applies the plan, then the queued choices.
// Anything short of a confirmed payment leaves the cookie on the plan step.
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
  await setOnboardingState({ ...rest, step: "slack" });
};
