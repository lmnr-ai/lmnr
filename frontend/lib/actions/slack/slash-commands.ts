import { and, eq, inArray } from "drizzle-orm";
import { isEmpty } from "lodash";
import { type z } from "zod/v4";

import { SlackSlashCommandSchema } from "@/lib/actions/slack/types";
import { db } from "@/lib/db/drizzle";
import { signals, slackChannelToEvents, slackIntegrations } from "@/lib/db/migrations/schema";

interface SlackCommandResponse {
  response_type: "ephemeral" | "in_channel";
  text?: string;
  blocks?: unknown[];
}

const availableSignals = ["error_trace_analysis", "warning_trace_analysis"];

export async function processSlashCommand(
  payload: z.infer<typeof SlackSlashCommandSchema>
): Promise<SlackCommandResponse> {
  const { command, text, team_id, channel_id } = SlackSlashCommandSchema.parse(payload);

  if (command !== "/laminar") {
    return {
      response_type: "ephemeral",
      text: "Unknown command. Please use `/laminar subscribe <event_name>` or `/laminar unsubscribe [event_name]`",
    };
  }

  const args = text.trim().split(/\s+/);
  const subcommand = args[0]?.toLowerCase();

  if (subcommand === "help" || !subcommand) {
    return {
      response_type: "ephemeral",
      text: "📚 *Laminar Slash Commands*\n\n• `/laminar subscribe <event_name>` - Subscribe this channel to an event\n• `/laminar unsubscribe [event_name]` - Unsubscribe from an event (or all events if no name provided)\n• `/laminar help` - Show this help message",
    };
  }

  if (subcommand === "subscribe") {
    const eventName = args.slice(1).join(" ").trim();

    if (!eventName) {
      return {
        response_type: "ephemeral",
        text: "❌ Please provide an event name. Usage: `/laminar subscribe <event_name>`",
      };
    }

    return await handleSubscribeCommand(team_id, channel_id, eventName);
  }

  if (subcommand === "unsubscribe") {
    const eventName = args.slice(1).join(" ").trim();
    return await handleUnsubscribeCommand(team_id, channel_id, eventName || null);
  }

  return {
    response_type: "ephemeral",
    text: `❌ Unknown subcommand: \`${subcommand}\`\n\nUse \`/laminar help\` to see available commands.`,
  };
}

async function handleSubscribeCommand(
  teamId: string,
  channelId: string,
  eventName: string
): Promise<SlackCommandResponse> {
  try {
    const integrations = await db.query.slackIntegrations.findMany({
      where: eq(slackIntegrations.teamId, teamId),
      columns: {
        id: true,
        projectId: true,
      },
      with: {
        project: {
          columns: {
            name: true,
          },
        },
      },
    });

    if (isEmpty(integrations)) {
      return {
        response_type: "ephemeral",
        text: "❌ Laminar is not connected to workspace. Please install the Laminar app first.",
      };
    }

    const projectIds = integrations.map((i) => i.projectId);

    const dbSignals = await db.query.signals.findMany({
      where: inArray(signals.projectId, projectIds),
      columns: {
        name: true,
        projectId: true,
      },
    });

    const matchedIntegration = availableSignals.includes(eventName)
      ? integrations[0]
      : integrations.find((i) =>
          dbSignals.some((event) => event.name === eventName && event.projectId === i.projectId)
        );

    if (!matchedIntegration) {
      return {
        response_type: "ephemeral",
        text: `❌ Event \`${eventName}\` not found in any connected projects.`,
      };
    }

    // Check if already subscribed
    const existingSubscription = await db.query.slackChannelToEvents.findFirst({
      where: and(
        eq(slackChannelToEvents.integrationId, matchedIntegration.id),
        eq(slackChannelToEvents.channelId, channelId),
        eq(slackChannelToEvents.eventName, eventName)
      ),
    });

    if (existingSubscription) {
      const projectName = matchedIntegration.project?.name || "Unknown Project";
      return {
        response_type: "ephemeral",
        text: `ℹ️ Already subscribed to event \`${eventName}\` for project *${projectName}*.`,
      };
    }

    await db
      .insert(slackChannelToEvents)
      .values({
        integrationId: matchedIntegration.id,
        projectId: matchedIntegration.projectId,
        channelId,
        eventName,
      })
      .onConflictDoNothing({
        target: [slackChannelToEvents.channelId, slackChannelToEvents.eventName, slackChannelToEvents.integrationId],
      });

    const projectName = matchedIntegration.project?.name || "Unknown Project";

    return {
      response_type: "in_channel",
      text: `✅ Successfully subscribed to event \`${eventName}\` for project *${projectName}*!\n\nThis channel will receive notifications when this event is triggered.`,
    };
  } catch (error) {
    console.error("Error handling subscribe command:", error);
    return {
      response_type: "ephemeral",
      text: "❌ An error occurred while processing your request. Please try again later.",
    };
  }
}

async function handleUnsubscribeCommand(
  teamId: string,
  channelId: string,
  eventName: string | null
): Promise<SlackCommandResponse> {
  try {
    const integrations = await db.query.slackIntegrations.findMany({
      where: eq(slackIntegrations.teamId, teamId),
      columns: {
        id: true,
        projectId: true,
      },
      with: {
        project: {
          columns: {
            name: true,
          },
        },
      },
    });

    if (isEmpty(integrations)) {
      return {
        response_type: "ephemeral",
        text: "❌ Laminar is not connected to this workspace. Please install the Laminar app first.",
      };
    }

    const integrationIds = integrations.map((i) => i.id);

    if (eventName) {
      const existingSubscription = await db.query.slackChannelToEvents.findFirst({
        where: and(
          inArray(slackChannelToEvents.integrationId, integrationIds),
          eq(slackChannelToEvents.channelId, channelId),
          eq(slackChannelToEvents.eventName, eventName)
        ),
      });

      if (!existingSubscription) {
        return {
          response_type: "ephemeral",
          text: `❌ No subscription found for event \`${eventName}\` in this channel.`,
        };
      }

      const integration = integrations.find((i) => i.id === existingSubscription.integrationId);
      const projectName = integration?.project?.name || "Unknown Project";

      await db
        .delete(slackChannelToEvents)
        .where(
          and(
            eq(slackChannelToEvents.id, existingSubscription.id),
            eq(slackChannelToEvents.integrationId, existingSubscription.integrationId),
            eq(slackChannelToEvents.channelId, channelId),
            eq(slackChannelToEvents.eventName, eventName)
          )
        );

      return {
        response_type: "in_channel",
        text: `✅ Successfully unsubscribed from event \`${eventName}\` for project *${projectName}*.`,
      };
    }

    // Count all subscriptions before deleting
    const allSubscriptions = await db.query.slackChannelToEvents.findMany({
      where: and(
        inArray(slackChannelToEvents.integrationId, integrationIds),
        eq(slackChannelToEvents.channelId, channelId)
      ),
    });

    if (allSubscriptions.length === 0) {
      return {
        response_type: "ephemeral",
        text: "ℹ️ No subscriptions found in this channel.",
      };
    }

    await db
      .delete(slackChannelToEvents)
      .where(
        and(inArray(slackChannelToEvents.integrationId, integrationIds), eq(slackChannelToEvents.channelId, channelId))
      );

    return {
      response_type: "in_channel",
      text: `✅ Successfully unsubscribed from ${allSubscriptions.length} event(s).`,
    };
  } catch (error) {
    console.error("Error handling unsubscribe command:", error);
    return {
      response_type: "ephemeral",
      text: "❌ An error occurred while processing your request. Please try again later.",
    };
  }
}
