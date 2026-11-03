import crypto from "crypto";

import { generatePkcePair } from "@/lib/actions/slack/broker";
import { cache } from "@/lib/cache";

// Server-minted state for the direct (Cloud) Slack OAuth flow. The `state` sent to
// Slack is an opaque random nonce; the workspace, return path, initiating user, and
// PKCE verifier live only in the server-side record. The callback can therefore
// trust nothing from the URL except the nonce, and only the user who started the
// flow can consume it (blocks login-CSRF into an attacker's Slack install).
//
// Records live in `cache`, which falls back to per-process memory without
// REDIS_URL, so a multi-replica deployment using the direct flow needs Redis.

const STATE_TTL_SECONDS = 600;
const STATE_PREFIX = "slack_oauth_state";

interface SlackOauthStateRecord {
  userId: string;
  workspaceId: string;
  returnPath?: string;
  codeVerifier: string;
}

export const mintSlackOauthState = async (input: {
  userId: string;
  workspaceId: string;
  returnPath?: string;
}): Promise<{ state: string; codeChallenge: string }> => {
  const { verifier, challenge } = generatePkcePair();
  const state = crypto.randomBytes(32).toString("base64url");
  const record: SlackOauthStateRecord = { ...input, codeVerifier: verifier };
  await cache.set(`${STATE_PREFIX}:${state}`, record, { expireAfterSeconds: STATE_TTL_SECONDS });
  return { state, codeChallenge: challenge };
};

// Single-use and bound to the initiating user: a mismatched user never consumes
// the record, so it stays redeemable by its owner until it expires.
export const consumeSlackOauthState = async (
  state: string,
  userId: string
): Promise<Omit<SlackOauthStateRecord, "userId"> | null> => {
  const record = await cache.getAndRemoveIfMatch<SlackOauthStateRecord>(`${STATE_PREFIX}:${state}`, "userId", userId);
  if (!record) {
    return null;
  }
  const { workspaceId, returnPath, codeVerifier } = record;
  return { workspaceId, returnPath, codeVerifier };
};
