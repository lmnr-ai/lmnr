import { z } from "zod/v4";

// Scopes requested for every Slack OAuth flow (direct-connect and broker).
// Defined here (no server-only imports) so client components can import it too.
// Notification scopes: chat:write*, *:read. Channel-agent scopes (app_mention + thread
// backfill): app_mentions:read, channels:history, groups:history. reactions:write powers the
// :eyes: ack on mention. Must match the Slack app manifest's bot scopes — adding here only
// requests them; existing installs need to reconnect.
export const SLACK_SCOPES = [
  "chat:write",
  "chat:write.public",
  "channels:read",
  "groups:read",
  "mpim:read",
  "app_mentions:read",
  "channels:history",
  "groups:history",
  "reactions:write",
];

const SlackOauthSuccessResponseSchema = z.looseObject({
  ok: z.literal(true),
  app_id: z.string(),
  access_token: z.string(),
  scope: z.string(),
  token_type: z.literal("bot"),
  team: z.object({
    id: z.string(),
    name: z.string(),
  }),
  bot_user_id: z.string(),
  // The Slack user who authorized the install.
  authed_user: z.looseObject({ id: z.string() }).optional(),
  incoming_webhook: z
    .looseObject({
      url: z.string(),
      channel: z.string(),
      channel_id: z.string(),
      configuration_url: z.string(),
    })
    .optional(),
});

const SlackOauthErrorResponseSchema = z.looseObject({
  ok: z.literal(false),
  error: z.string(),
});

export const SlackOauthResponseSchema = z.union([SlackOauthSuccessResponseSchema, SlackOauthErrorResponseSchema]);

const SlackAppUninstalledEventSchema = z.looseObject({
  type: z.literal("app_uninstalled"),
  event_ts: z.string(),
});

const SlackTokensRevokedEventSchema = z.looseObject({
  type: z.literal("tokens_revoked"),
  event_ts: z.string(),
  tokens: z.looseObject({
    oauth: z.array(z.string()),
    bot: z.array(z.string()),
  }),
});

// Mention of the bot in a channel; the webhook acks it with :eyes: and runs the agent (`lib/agent/slack`).
const SlackAppMentionEventSchema = z.looseObject({
  type: z.literal("app_mention"),
  channel: z.string().optional(),
  ts: z.string().optional(),
});

const SlackGenericEventSchema = z.looseObject({
  type: z.string(),
  event_ts: z.string().optional(),
});

export const SlackEventSchema = z.union([
  SlackAppUninstalledEventSchema,
  SlackTokensRevokedEventSchema,
  SlackAppMentionEventSchema,
  SlackGenericEventSchema,
]);

const SlackUrlVerificationRequestSchema = z.looseObject({
  type: z.literal("url_verification"),
  challenge: z.string(),
  token: z.string(),
});

const SlackEventCallbackSchema = z.looseObject({
  type: z.literal("event_callback"),
  token: z.string(),
  team_id: z.string(),
  api_app_id: z.string(),
  event: SlackEventSchema,
  event_id: z.string(),
  event_time: z.number(),
});

export const SlackBlockActionsSchema = z.object({
  payload: z.string(),
});

export const SlackWebhookRequestSchema = z.union([
  SlackUrlVerificationRequestSchema,
  SlackEventCallbackSchema,
  SlackBlockActionsSchema,
]);
