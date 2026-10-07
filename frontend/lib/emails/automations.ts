import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, projects, users } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

import { RESEND } from "./client";

// Names must match the trigger / wait-for-event steps of the automations in the Resend dashboard.
export const USER_ONBOARDED_EVENT = "user.onboarded";
export const PROJECT_HAS_TRACES_EVENT = "project.has_traces";

// Payload values must stay flat: Resend event schemas only allow string/number/boolean/date keys.
const sendEvent = async (event: string, email: string, payload: Record<string, string | boolean>) => {
  if (!isFeatureEnabled(Feature.EMAIL_AUTOMATIONS)) return;

  try {
    const { error } = await RESEND.events.send({ event, email, payload });
    if (error) console.error(`Failed to send Resend event ${event}:`, error);
  } catch (e) {
    // Automations are best-effort and must never break the request that emitted them.
    console.error(`Failed to send Resend event ${event}:`, e);
  }
};

export const sendUserOnboardedEvent = ({
  email,
  projectId,
  hasTraces,
}: {
  email: string;
  projectId: string;
  hasTraces: boolean;
}) => sendEvent(USER_ONBOARDED_EVENT, email, { project_id: projectId, has_traces: hasTraces });

// Events are per-contact, so this goes to every workspace owner: the welcomed user created the
// workspace, but whoever opens the traces page first (and flips has_traces) may be a teammate.
export const sendProjectHasTracesEvent = async (projectId: string) => {
  if (!isFeatureEnabled(Feature.EMAIL_AUTOMATIONS)) return;

  try {
    const owners = await db
      .select({ email: users.email })
      .from(projects)
      .innerJoin(membersOfWorkspaces, eq(membersOfWorkspaces.workspaceId, projects.workspaceId))
      .innerJoin(users, eq(users.id, membersOfWorkspaces.userId))
      .where(and(eq(projects.id, projectId), eq(membersOfWorkspaces.memberRole, "owner")));

    await Promise.all(owners.map(({ email }) => sendEvent(PROJECT_HAS_TRACES_EVENT, email, { project_id: projectId })));
  } catch (e) {
    console.error(`Failed to send ${PROJECT_HAS_TRACES_EVENT} event for project ${projectId}:`, e);
  }
};
