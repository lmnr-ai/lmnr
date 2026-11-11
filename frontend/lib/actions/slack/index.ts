import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod/v4";

import { SlackOauthResponseSchema } from "@/lib/actions/slack/types";
import { getSlackUserId, linkSlackUser } from "@/lib/actions/slack/user-links";
import { assertWorkspaceHasSlack } from "@/lib/actions/usage/plan-gates";
import { cache } from "@/lib/cache";
import { decodeSlackToken, encodeSlackToken } from "@/lib/crypto";
import { db } from "@/lib/db/drizzle";
import { alertTargets, reportTargets, slackIntegrations } from "@/lib/db/migrations/schema";
import { getBrokerLicenseKey } from "@/lib/license";

const ConnectSlackIntegrationSchema = z.object({
  code: z.string(),
  workspaceId: z.guid(),
  userId: z.guid(),
});

const DeleteSlackIntegrationSchema = z.union([z.object({ workspaceId: z.guid() }), z.object({ teamId: z.string() })]);

const SendTestNotificationSchema = z.object({
  workspaceId: z.guid(),
  channelId: z.string(),
  eventName: z.string().optional(),
});

export interface SlackIntegration {
  id: string;
  workspaceId: string;
  teamId: string;
  teamName: string | null;
}

export interface SlackChannel {
  id: string;
  name: string;
  isMember: boolean;
  isPrivate: boolean;
}

export async function getSlackIntegration(workspaceId: string): Promise<SlackIntegration | null> {
  const [result] = await db
    .select({
      id: slackIntegrations.id,
      workspaceId: slackIntegrations.workspaceId,
      teamId: slackIntegrations.teamId,
      teamName: slackIntegrations.teamName,
    })
    .from(slackIntegrations)
    .where(eq(slackIntegrations.workspaceId, workspaceId))
    .limit(1);

  return result || null;
}

// Exchanges an OAuth code for a bot token via Slack's oauth.v2.access endpoint
// using HTTP Basic auth with the app credentials. The redirect_uri must match
// the one used in the authorize leg or Slack returns bad_redirect_uri.
export async function exchangeSlackOauthCode(code: string, redirectUri: string, codeVerifier?: string) {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("No client id/secret provided.");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    code,
    redirect_uri: redirectUri,
  });
  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body,
  });

  const json = await tokenResponse.json();
  const data = SlackOauthResponseSchema.parse(json);

  if (!data.ok) {
    throw new Error(data.error);
  }

  return data;
}

// Encrypts the bot token and upserts the workspace's Slack integration. Shared
// by the direct-connect (cloud) path and the brokered (self-hosted) path so the
// stored row is identical regardless of how the token was obtained.
async function persistSlackIntegration(input: {
  workspaceId: string;
  teamId: string;
  teamName: string | null;
  token: string;
}) {
  const { workspaceId, teamId, teamName, token } = input;
  const { value: encryptedToken, nonce } = await encodeSlackToken(teamId, token);

  await db
    .insert(slackIntegrations)
    .values({
      workspaceId,
      teamId,
      teamName,
      token: encryptedToken,
      nonceHex: nonce,
    })
    .onConflictDoUpdate({
      target: slackIntegrations.workspaceId,
      set: {
        teamId,
        teamName,
        token: encryptedToken,
        nonceHex: nonce,
      },
    });
}

export async function connectSlackIntegration(input: z.infer<typeof ConnectSlackIntegrationSchema>) {
  const { code, workspaceId, userId } = ConnectSlackIntegrationSchema.parse(input);

  const redirectUri = process.env.SLACK_REDIRECT_URL;
  if (!redirectUri) {
    throw new Error("No redirect uri set.");
  }

  const data = await exchangeSlackOauthCode(code, redirectUri);

  await persistSlackIntegration({
    workspaceId,
    teamId: data.team.id,
    teamName: data.team.name || null,
    token: data.access_token,
  });
  // The installer is the Laminar user in this browser session, so their Slack identity comes free.
  if (data.authed_user) {
    await linkSlackUser({ userId, teamId: data.team.id, slackUserId: data.authed_user.id });
  }
}

const BrokerRedeemResponseSchema = z.object({
  kind: z.enum(["install", "link"]).optional(),
  token: z.string().optional(),
  teamId: z.string(),
  teamName: z.string().nullable().optional(),
  workspaceId: z.guid(),
  slackUserId: z.string().optional(),
});

// Redeems a one-time broker claim server-to-server, authenticated by this instance's license key.
// Inert unless SLACK_BROKER_URL and a license key (env or settings) are configured.
async function redeemBrokerClaim(input: { claim: string; workspaceId: string }) {
  const brokerUrl = process.env.SLACK_BROKER_URL;
  const licenseKey = await getBrokerLicenseKey();
  if (!brokerUrl || !licenseKey) {
    throw new Error("Slack broker is not configured (SLACK_BROKER_URL / license key).");
  }

  const response = await fetch(`${brokerUrl.replace(/\/+$/, "")}/api/broker/slack/redeem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${licenseKey}`,
    },
    body: JSON.stringify({ claim: input.claim }),
  });

  if (!response.ok) {
    throw new Error(`Broker redeem failed with status ${response.status}`);
  }

  const payload = BrokerRedeemResponseSchema.parse(await response.json());

  // The claim is bound at /cb to the workspace the flow was started for. The
  // caller's URL workspaceId is attacker-controllable (it rides the public
  // callback as a query param), so reject any claim whose bound workspace
  // doesn't match — otherwise a member of workspace B could redeem a claim
  // minted for workspace A by rewriting the workspaceId in the callback URL.
  if (payload.workspaceId !== input.workspaceId) {
    throw new Error("Broker claim workspace mismatch.");
  }
  return payload;
}

// Brokered (self-hosted) connect: redeem the claim for the bot token, then
// persist exactly as the direct path does. The token transits over TLS only —
// it never appears in a browser URL.
export async function redeemBrokeredSlackToken(input: { claim: string; workspaceId: string; userId: string }) {
  const { kind, token, teamId, teamName, workspaceId, slackUserId } = await redeemBrokerClaim(input);
  if (kind === "link" || !token) {
    throw new Error("Broker claim is not an install claim.");
  }

  await persistSlackIntegration({
    workspaceId,
    teamId,
    teamName: teamName ?? null,
    token,
  });
  if (slackUserId) {
    await linkSlackUser({ userId: input.userId, teamId, slackUserId });
  }
}

// Brokered Sign in with Slack: the broker verified the user's identity and hands back only their
// Slack ids. The team must be the one this workspace's bot is installed in.
export async function redeemBrokeredSlackLink(input: { claim: string; workspaceId: string; userId: string }) {
  const { kind, teamId, slackUserId } = await redeemBrokerClaim(input);
  if (kind !== "link" || !slackUserId) {
    throw new Error("Broker claim is not a link claim.");
  }
  await linkSlackUserToWorkspaceTeam({ workspaceId: input.workspaceId, userId: input.userId, teamId, slackUserId });
}

// Links only when the Slack identity is in the team the workspace's bot is installed in.
export async function linkSlackUserToWorkspaceTeam(input: {
  workspaceId: string;
  userId: string;
  teamId: string;
  slackUserId: string;
}) {
  const integration = await getSlackIntegration(input.workspaceId);
  if (!integration || integration.teamId !== input.teamId) {
    throw new Error("Signed in to a different Slack workspace than the one connected to Laminar.");
  }
  await linkSlackUser({ userId: input.userId, teamId: input.teamId, slackUserId: input.slackUserId });
}

// Asks the broker for a Slack authorize URL (install or Sign in with Slack). The broker always
// returns a slack.com URL; checking the host keeps a misconfigured SLACK_BROKER_URL or a
// compromised broker from turning the caller's redirect into an open redirect.
export async function requestBrokerAuthorizeUrl(body: {
  workspaceId: string;
  returnUrl: string;
  kind?: "link";
  teamId?: string;
}): Promise<string> {
  const brokerUrl = process.env.SLACK_BROKER_URL;
  const licenseKey = await getBrokerLicenseKey();
  if (!brokerUrl || !licenseKey) {
    throw new Error("Slack broker is not configured (SLACK_BROKER_URL / license key).");
  }

  const response = await fetch(`${brokerUrl.replace(/\/+$/, "")}/api/broker/slack/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${licenseKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Slack broker /start failed with status ${response.status}`);
  }

  const { authorizeUrl } = (await response.json()) as { authorizeUrl: string };
  let authorizeHost: string;
  try {
    authorizeHost = new URL(authorizeUrl).host;
  } catch {
    authorizeHost = "";
  }
  if (authorizeHost !== "slack.com") {
    throw new Error(`Slack broker returned unexpected authorizeUrl host: ${authorizeHost}`);
  }
  return authorizeUrl;
}

export async function deleteSlackIntegration(
  input: z.infer<typeof DeleteSlackIntegrationSchema>
): Promise<{ success: boolean }> {
  const parsed = DeleteSlackIntegrationSchema.parse(input);

  const condition =
    "workspaceId" in parsed
      ? eq(slackIntegrations.workspaceId, parsed.workspaceId)
      : eq(slackIntegrations.teamId, parsed.teamId);

  const [integration] = await db.select({ id: slackIntegrations.id }).from(slackIntegrations).where(condition).limit(1);

  if (!integration) {
    return { success: true };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(alertTargets)
      .where(and(eq(alertTargets.integrationId, integration.id), isNotNull(alertTargets.integrationId)));

    await tx
      .delete(reportTargets)
      .where(and(eq(reportTargets.integrationId, integration.id), isNotNull(reportTargets.integrationId)));

    await tx.delete(slackIntegrations).where(eq(slackIntegrations.id, integration.id));
  });

  return { success: true };
}

async function getIntegrationWithToken(workspaceId: string) {
  const [integration] = await db
    .select({
      id: slackIntegrations.id,
      teamId: slackIntegrations.teamId,
      token: slackIntegrations.token,
      nonceHex: slackIntegrations.nonceHex,
    })
    .from(slackIntegrations)
    .where(eq(slackIntegrations.workspaceId, workspaceId))
    .limit(1);

  if (!integration) {
    throw new Error("Slack integration not found for this workspace");
  }

  const token = await decodeSlackToken(integration.teamId, integration.nonceHex, integration.token);
  return { ...integration, decryptedToken: token };
}

// Resolve a decrypted bot token by Slack team_id. team_id is not unique (a team can connect to many
// Laminar workspaces) but every such install posts as the same bot user, so any of them works for a
// team-scoped action like reacting. LIMIT 1; returns null when the team has no integration.
export async function getIntegrationTokenByTeamId(teamId: string): Promise<string | null> {
  const [integration] = await db
    .select({ teamId: slackIntegrations.teamId, token: slackIntegrations.token, nonceHex: slackIntegrations.nonceHex })
    .from(slackIntegrations)
    .where(eq(slackIntegrations.teamId, teamId))
    .limit(1);

  if (!integration) {
    return null;
  }

  return decodeSlackToken(integration.teamId, integration.nonceHex, integration.token);
}

// Best-effort :eyes: reaction on a mentioned message, fired the moment the webhook receives the
// mention (before the slow agent run) so the user sees an immediate ack. Never throws: a failure
// (no token, missing scope, already_reacted, etc.) is logged and swallowed so it can't block
// forwarding the mention.
export async function addEyesReaction(input: { teamId: string; channel: string; ts: string }): Promise<void> {
  try {
    const token = await getIntegrationTokenByTeamId(input.teamId);
    if (!token) {
      return;
    }

    // Bound the call: it's awaited before forwarding the mention, so a hung Slack socket would block
    // the agent from ever running. ~2.5s, then abort and continue (still best-effort).
    const response = await fetch("https://slack.com/api/reactions.add", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "eyes", channel: input.channel, timestamp: input.ts }),
      signal: AbortSignal.timeout(2500),
    });
    const data = await response.json();
    // already_reacted (a Slack retry redelivered the mention) is harmless.
    if (!data.ok && data.error !== "already_reacted") {
      console.warn(`Slack reactions.add failed: ${data.error}`);
    }
  } catch (error) {
    console.warn("Slack reactions.add threw (swallowed):", error);
  }
}

const SLACK_CONVERSATIONS_PAGE_LIMIT = 500;
// Listings are cached briefly so pages that redact stored targets don't burn Slack's Tier 2/3 limits.
const SLACK_CHANNELS_CACHE_TTL_SECONDS = 60;

interface SlackConversationsListResponse {
  ok: boolean;
  error?: string;
  channels?: { id: string; name: string; is_member?: boolean }[];
  response_metadata?: { next_cursor?: string };
}

interface ChannelListing {
  channels: SlackChannel[];
  // True when Slack rate-limited us mid-pagination and the list is incomplete.
  rateLimited: boolean;
}

async function listConversations(
  token: string,
  method: "conversations.list" | "users.conversations",
  params: Record<string, string>,
  isPrivate: boolean
): Promise<ChannelListing> {
  const channels: SlackChannel[] = [];
  let cursor = "";

  do {
    const url = new URL(`https://slack.com/api/${method}`);
    url.searchParams.set("exclude_archived", "true");
    url.searchParams.set("limit", String(SLACK_CONVERSATIONS_PAGE_LIMIT));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 429) {
      return { channels, rateLimited: true };
    }

    const data = (await response.json()) as SlackConversationsListResponse;
    if (data.error === "ratelimited") {
      return { channels, rateLimited: true };
    }
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    for (const ch of data.channels ?? []) {
      // users.conversations only returns channels the bot is in, and omits is_member.
      channels.push({ id: ch.id, name: ch.name, isMember: isPrivate || !!ch.is_member, isPrivate });
    }

    cursor = data.response_metadata?.next_cursor ?? "";
  } while (cursor);

  return { channels, rateLimited: false };
}

async function cachedListing(key: string, load: () => Promise<ChannelListing>): Promise<ChannelListing> {
  const cached = await cache.get<SlackChannel[]>(key);
  if (cached) {
    return { channels: cached, rateLimited: false };
  }
  const listing = await load();
  if (!listing.rateLimited) {
    await cache.set(key, listing.channels, { expireAfterSeconds: SLACK_CHANNELS_CACHE_TTL_SECONDS });
  }
  return listing;
}

export interface GetSlackChannelsResult extends ChannelListing {
  // False when the viewer hasn't linked their Slack account, so private channels are left out.
  slackLinked: boolean;
}

// The channels `userId` may see: every public channel, plus the private channels that both the
// bot and the user's linked Slack account are members of (users.conversations with `user` filters
// private channels to shared membership). Never list private channels by the bot token alone.
export async function getSlackChannels(workspaceId: string, userId: string): Promise<GetSlackChannelsResult> {
  const integration = await getIntegrationWithToken(workspaceId);
  const token = integration.decryptedToken;
  const slackUserId = await getSlackUserId(integration.teamId, userId);

  const [publicListing, privateListing] = await Promise.all([
    cachedListing(`slack_channels:public:${integration.teamId}`, () =>
      listConversations(token, "conversations.list", { types: "public_channel" }, false)
    ),
    slackUserId
      ? cachedListing(`slack_channels:private:${integration.teamId}:${slackUserId}`, () =>
          listConversations(token, "users.conversations", { types: "private_channel", user: slackUserId }, true)
        ).catch((e) => {
          // e.g. user_not_found / account_inactive for a linked account that's gone: drop only the
          // private channels and report the account as unlinked so the user can link again.
          console.warn("Slack private channel listing failed; listing public channels only", e);
          return null;
        })
      : Promise.resolve(null),
  ]);

  return {
    channels: [...publicListing.channels, ...(privateListing?.channels ?? [])],
    rateLimited: publicListing.rateLimited || !!privateListing?.rateLimited,
    slackLinked: privateListing !== null,
  };
}

export async function sendTestSlackNotification(input: z.infer<typeof SendTestNotificationSchema>) {
  const { workspaceId, channelId, eventName } = SendTestNotificationSchema.parse(input);
  await assertWorkspaceHasSlack(workspaceId);

  const integration = await getIntegrationWithToken(workspaceId);

  const displayEventName = eventName || "test_event";

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Event*: \`${displayEventName}\``,
      },
    },
    {
      type: "markdown",
      text: "*sample_key*:\nThis is a test notification from Laminar. Your alert is configured correctly.",
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Trace",
            emoji: true,
          },
          url: "https://laminar.sh",
          action_id: "view_trace",
        },
      ],
    },
  ];

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integration.decryptedToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      blocks,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    if (data.error === "not_in_channel") {
      throw new Error(
        "The Laminar bot is not in this channel. For private channels, please invite the bot by typing /invite @Laminar in the channel, then try again."
      );
    }
    throw new Error(`Failed to send test notification: ${data.error}`);
  }

  return { success: true };
}
