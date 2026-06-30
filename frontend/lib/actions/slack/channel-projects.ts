import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { projects, slackChannelProjects, slackIntegrations } from "@/lib/db/migrations/schema";

export interface SlackChannelProjectBinding {
  id: string;
  channelId: string;
  channelName: string | null;
  projectId: string;
  projectName: string | null;
}

const UpsertBindingSchema = z.object({
  workspaceId: z.guid(),
  channelId: z.string().min(1),
  channelName: z.string().optional(),
  projectId: z.guid(),
});

const DeleteBindingSchema = z.object({
  workspaceId: z.guid(),
  channelId: z.string().min(1),
});

/** All Slack channel→project bindings for a workspace, joined to the project name for display. */
export async function getChannelProjectBindings(workspaceId: string): Promise<SlackChannelProjectBinding[]> {
  return db
    .select({
      id: slackChannelProjects.id,
      channelId: slackChannelProjects.channelId,
      channelName: slackChannelProjects.channelName,
      projectId: slackChannelProjects.projectId,
      projectName: projects.name,
    })
    .from(slackChannelProjects)
    .leftJoin(projects, eq(projects.id, slackChannelProjects.projectId))
    .where(eq(slackChannelProjects.workspaceId, workspaceId))
    .orderBy(desc(slackChannelProjects.createdAt));
}

/**
 * Bind a Slack channel to a project (upsert on the global unique `channel_id` index). A channel routes
 * to at most one project instance-wide, so the conflict target is `channel_id` alone — this also lets
 * the team-wide in-Slack picker MOVE a binding to a project in a different workspace (the inserted
 * `workspace_id` would otherwise collide with the existing row's global `channel_id` and fail). The
 * caller must ensure `projectId` belongs to `workspaceId`; the route is membership-gated by proxy.ts.
 */
export async function upsertChannelProjectBinding(input: z.infer<typeof UpsertBindingSchema>) {
  const { workspaceId, channelId, channelName, projectId } = UpsertBindingSchema.parse(input);

  // Reject a project that isn't in this workspace — a binding could otherwise route a channel to a
  // project the team doesn't own (the app-server also scopes its lookup by workspace_id).
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  if (!project) {
    throw new Error("Project not found in this workspace");
  }

  const [integration] = await db
    .select({ id: slackIntegrations.id })
    .from(slackIntegrations)
    .where(eq(slackIntegrations.workspaceId, workspaceId))
    .limit(1);
  if (!integration) {
    throw new Error("Slack integration not found for this workspace");
  }

  await db
    .insert(slackChannelProjects)
    .values({ workspaceId, channelId, channelName: channelName ?? null, projectId, integrationId: integration.id })
    .onConflictDoUpdate({
      target: slackChannelProjects.channelId,
      set: { workspaceId, projectId, channelName: channelName ?? null, integrationId: integration.id },
    });
}

/** Remove the binding for a channel (no-op if it doesn't exist). */
export async function deleteChannelProjectBinding(input: z.infer<typeof DeleteBindingSchema>) {
  const { workspaceId, channelId } = DeleteBindingSchema.parse(input);
  await db
    .delete(slackChannelProjects)
    .where(and(eq(slackChannelProjects.workspaceId, workspaceId), eq(slackChannelProjects.channelId, channelId)));
}
