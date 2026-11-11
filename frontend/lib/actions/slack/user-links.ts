import crypto from "crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { cache } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import { slackUserLinks } from "@/lib/db/migrations/schema";

// Links a Laminar user to their Slack user in one Slack team. Slack's Marketplace privacy model
// forbids showing private channel names to people who aren't members, so private channels are
// only listed for a user whose Slack identity we verified through OAuth (never self-declared).

const LINK_STATE_TTL_SECONDS = 600;
const LINK_STATE_PREFIX = "slack_link_state";
// Direct (Cloud) link flows share SLACK_REDIRECT_URL with the install flow; this prefix on the
// `state` param tells the callback which one it is. Install states start with a workspace UUID.
export const SLACK_LINK_STATE_PARAM_PREFIX = "link.";

export async function getSlackUserId(teamId: string, userId: string): Promise<string | null> {
  const [link] = await db
    .select({ slackUserId: slackUserLinks.slackUserId })
    .from(slackUserLinks)
    .where(and(eq(slackUserLinks.userId, userId), eq(slackUserLinks.teamId, teamId)))
    .limit(1);
  return link?.slackUserId ?? null;
}

export async function linkSlackUser(input: { userId: string; teamId: string; slackUserId: string }) {
  await db
    .insert(slackUserLinks)
    .values(input)
    .onConflictDoUpdate({
      target: [slackUserLinks.userId, slackUserLinks.teamId],
      set: { slackUserId: input.slackUserId },
    });
}

export interface SlackLinkState {
  userId: string;
  workspaceId: string;
  returnPath?: string;
  // OIDC nonce for the direct flow; the broker mints and checks its own in brokered mode.
  oidcNonce: string;
}

// Binds a link flow to the Laminar user who started it, so a callback can only link the account of
// the signed-in user that began the flow.
export async function mintSlackLinkState(
  input: Omit<SlackLinkState, "oidcNonce">
): Promise<{ id: string } & SlackLinkState> {
  const id = crypto.randomBytes(24).toString("base64url");
  const state: SlackLinkState = { ...input, oidcNonce: crypto.randomBytes(16).toString("base64url") };
  await cache.set(`${LINK_STATE_PREFIX}:${id}`, state, { expireAfterSeconds: LINK_STATE_TTL_SECONDS });
  return { id, ...state };
}

// Single use, and only by the user who minted it.
export async function consumeSlackLinkState(id: string, userId: string): Promise<SlackLinkState | null> {
  return cache.getAndRemoveIfMatch<SlackLinkState>(`${LINK_STATE_PREFIX}:${id}`, "userId", userId);
}

export function buildSlackOidcAuthorizeUrl(input: {
  state: string;
  nonce: string;
  redirectUri: string;
  teamId?: string;
}): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    throw new Error("SLACK_CLIENT_ID is not configured.");
  }
  const sp = new URLSearchParams({
    response_type: "code",
    scope: "openid",
    client_id: clientId,
    state: input.state,
    nonce: input.nonce,
    redirect_uri: input.redirectUri,
  });
  if (input.teamId) {
    sp.set("team", input.teamId);
  }
  return `https://slack.com/openid/connect/authorize?${sp}`;
}

const OidcTokenResponseSchema = z.union([
  z.looseObject({ ok: z.literal(true), id_token: z.string() }),
  z.looseObject({ ok: z.literal(false), error: z.string() }),
]);

const IdTokenClaimsSchema = z.looseObject({
  aud: z.string(),
  nonce: z.string().optional(),
  "https://slack.com/user_id": z.string(),
  "https://slack.com/team_id": z.string(),
});

// Exchanges a Sign in with Slack code for the user's identity. The id_token comes straight from
// Slack's token endpoint over TLS, which OIDC Core (3.1.3.7) accepts in place of a signature check.
// The nonce check rejects a code issued for a different authorize request (code injection).
export async function exchangeSlackOidcCode(input: {
  code: string;
  redirectUri: string;
  expectedNonce: string;
}): Promise<{ slackUserId: string; teamId: string }> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("No client id/secret provided.");
  }

  const response = await fetch("https://slack.com/api/openid.connect.token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ code: input.code, redirect_uri: input.redirectUri }),
  });
  const data = OidcTokenResponseSchema.parse(await response.json());
  if (!data.ok) {
    throw new Error(data.error);
  }

  const payload = data.id_token.split(".")[1] ?? "";
  const claims = IdTokenClaimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  if (claims.aud !== clientId) {
    throw new Error("Slack id_token audience mismatch.");
  }
  if (claims.nonce !== input.expectedNonce) {
    throw new Error("Slack id_token nonce mismatch.");
  }

  return { slackUserId: claims["https://slack.com/user_id"], teamId: claims["https://slack.com/team_id"] };
}
