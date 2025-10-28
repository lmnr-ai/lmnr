import { z } from "zod/v4";

const SlackOauthSuccessResponseSchema = z.object({
  ok: z.literal(true),
  app_id: z.string(),
  access_token: z.string(),
  scope: z.string(),
  token_type: z.literal("bot"),
  team: z.object({
    id: z.string(),
    name: z.string(),
  }),
  incoming_webhook: z.object({
    url: z.string(),
    channel: z.string(),
    channel_id: z.string(),
    configuration_url: z.string(),
  }),
  bot_user_id: z.string(),
});

const SlackOauthErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
});

export const SlackOauthResponseSchema = z.union([SlackOauthSuccessResponseSchema, SlackOauthErrorResponseSchema]);

const SlackAppUninstalledEventSchema = z.object({
  type: z.literal("app_uninstalled"),
  event_ts: z.string(),
});

const SlackTokensRevokedEventSchema = z.object({
  type: z.literal("tokens_revoked"),
  event_ts: z.string(),
  tokens: z.object({
    oauth: z.array(z.string()),
    bot: z.array(z.string()),
  }),
});

const SlackMemberJoinedChannelEventSchema = z.object({
  type: z.literal("member_joined_channel"),
  user: z.string(),
  channel: z.string(),
  channel_type: z.string(),
  team: z.string(),
  inviter: z.string().optional(),
  event_ts: z.string(),
});

const SlackMemberLeftChannelEventSchema = z.object({
  type: z.literal("member_left_channel"),
  user: z.string(),
  channel: z.string(),
  channel_type: z.string(),
  team: z.string(),
  event_ts: z.string(),
});

export const SlackEventSchema = z.union([
  SlackAppUninstalledEventSchema,
  SlackTokensRevokedEventSchema,
  SlackMemberJoinedChannelEventSchema,
  SlackMemberLeftChannelEventSchema,
]);

export const SlackUrlVerificationRequestSchema = z.object({
  type: z.literal("url_verification"),
  challenge: z.string(),
  token: z.string(),
});

export const SlackEventCallbackSchema = z.object({
  type: z.literal("event_callback"),
  token: z.string(),
  team_id: z.string(),
  api_app_id: z.string(),
  event: SlackEventSchema,
  event_id: z.string(),
  event_time: z.number(),
});

export const SlackWebhookRequestSchema = z.union([SlackUrlVerificationRequestSchema, SlackEventCallbackSchema]);

// Type exports
export type SlackOauthResponse = z.infer<typeof SlackOauthResponseSchema>;
export type SlackEvent = z.infer<typeof SlackEventSchema>;
export type SlackAppUninstalledEvent = z.infer<typeof SlackAppUninstalledEventSchema>;
export type SlackTokensRevokedEvent = z.infer<typeof SlackTokensRevokedEventSchema>;
export type SlackMemberJoinedChannelEvent = z.infer<typeof SlackMemberJoinedChannelEventSchema>;
export type SlackMemberLeftChannelEvent = z.infer<typeof SlackMemberLeftChannelEventSchema>;
export type SlackUrlVerificationRequest = z.infer<typeof SlackUrlVerificationRequestSchema>;
export type SlackEventCallback = z.infer<typeof SlackEventCallbackSchema>;
export type SlackWebhookRequest = z.infer<typeof SlackWebhookRequestSchema>;
