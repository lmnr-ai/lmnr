import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { upsertChannelProjectBinding } from "@/lib/actions/slack/channel-projects";
import { db } from "@/lib/db/drizzle";
import { projects, slackIntegrations } from "@/lib/db/migrations/schema";

// The slice of a Slack `block_actions` interaction payload we consume (the project picker). Loose so
// Slack's many extra fields don't fail parsing.
const InteractionPayloadSchema = z.looseObject({
  type: z.string(),
  team: z.looseObject({ id: z.string() }).optional(),
  channel: z.looseObject({ id: z.string(), name: z.string().optional() }).optional(),
  // Single-use callback URL to reply to / replace the interactive message (no token needed).
  response_url: z.string().optional(),
  actions: z
    .array(
      z.looseObject({
        action_id: z.string(),
        selected_option: z.looseObject({ value: z.string() }).optional(),
      })
    )
    .default([]),
});

export const SELECT_PROJECT_ACTION_ID = "slack_select_project";

export interface ProjectSelection {
  projectId: string;
  teamId: string;
  channelId: string;
  channelName?: string;
  responseUrl?: string;
}

// Pure: parse a raw `block_actions` payload into a project selection, or null when it isn't our
// picker action / is missing the fields needed to bind. Exported for unit testing.
export function parseProjectSelection(rawPayload: string): ProjectSelection | null {
  const payload = InteractionPayloadSchema.parse(JSON.parse(rawPayload));
  if (payload.type !== "block_actions") {
    return null;
  }
  const action = payload.actions.find((a) => a.action_id === SELECT_PROJECT_ACTION_ID);
  const projectId = action?.selected_option?.value;
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;
  if (!projectId || !teamId || !channelId) {
    return null;
  }
  return { projectId, teamId, channelId, channelName: payload.channel?.name, responseUrl: payload.response_url };
}

// Reply to an interaction via its response_url (the URL is the capability — no bot token needed).
// `replace_original: true` swaps the message carrying the picker for the given text. Best-effort.
async function postToResponseUrl(responseUrl: string, text: string): Promise<void> {
  // Defence in depth: the payload is HMAC-verified so this is Slack-minted, but pin the host to
  // hooks.slack.com so a compromised signing secret can't turn this into an SSRF probe of internals.
  if (!responseUrl.startsWith("https://hooks.slack.com/")) {
    console.warn("Slack response_url has unexpected host, refusing to post.");
    return;
  }
  try {
    // Bound the call to stay under Slack's 3s interactivity budget — abort after ~2.5s, then continue.
    const res = await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replace_original: true, text }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      console.warn(`Slack response_url post failed: ${res.status}`);
    }
  } catch (error) {
    console.warn("Slack response_url post threw (swallowed):", error);
  }
}

/**
 * Handle a Slack `block_actions` interaction from the project picker. Validates the selected project
 * belongs to a workspace the Slack team is connected to (defence in depth — the value is
 * attacker-influenceable), binds the channel via the existing upsert, then confirms via response_url.
 *
 * Throws only on a parse failure (the route returns 200 regardless — Slack's 3s budget); product-level
 * failures (foreign project, missing integration) are surfaced to the user via response_url and the
 * function returns normally.
 */
export async function handleSlackInteraction(rawPayload: string): Promise<void> {
  const selection = parseProjectSelection(rawPayload);
  if (!selection) {
    return;
  }
  const { projectId, teamId, channelId, channelName, responseUrl } = selection;

  // Resolve the project's workspace AND validate the team is connected to it, in one query: a project
  // from a workspace this team isn't connected to (substituted uuid) returns no row and is rejected.
  const [row] = await db
    .select({ workspaceId: projects.workspaceId, projectName: projects.name })
    .from(projects)
    .innerJoin(slackIntegrations, eq(slackIntegrations.workspaceId, projects.workspaceId))
    .where(and(eq(projects.id, projectId), eq(slackIntegrations.teamId, teamId)))
    .limit(1);

  if (!row) {
    if (responseUrl) {
      await postToResponseUrl(
        responseUrl,
        "That project isn't available to this Slack workspace. Please pick another."
      );
    }
    return;
  }

  try {
    await upsertChannelProjectBinding({
      workspaceId: row.workspaceId,
      channelId,
      channelName,
      projectId,
    });
  } catch (error) {
    console.error("Slack channel binding failed:", error);
    if (responseUrl) {
      await postToResponseUrl(responseUrl, "I couldn't connect this channel to that project. Please try again.");
    }
    return;
  }

  // Bind succeeded — confirm (and replace the picker so it can't be re-submitted). A confirm-post
  // failure is logged inside postToResponseUrl but NOT treated as a bind failure.
  if (responseUrl) {
    await postToResponseUrl(
      responseUrl,
      `✅ Connected this channel to *${row.projectName}*. Mention me again and I'll answer from this project.`
    );
  }
}
