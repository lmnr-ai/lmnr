import crypto from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { exchangeSlackOauthCode } from "@/lib/actions/slack";
import { SLACK_SCOPES } from "@/lib/actions/slack/types";
import { hashApiKey } from "@/lib/api-keys";
import { cache } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import { slackBrokerInstances } from "@/lib/db/migrations/schema";

// Slack OAuth broker for self-hosted instances (RFC LAM-1675).
// The broker holds the official Laminar Slack app's secrets, runs both OAuth
// legs, and hands the bot token back to the calling instance via a one-time
// claim code. Message content never transits the broker.

const STATE_TTL_SECONDS = 600;
const CLAIM_TTL_SECONDS = 300;
const CLAIM_PREFIX = "slack_broker_claim";
const STATE_PREFIX = "slack_broker_state";

interface StatePayload {
  instanceId: string;
  workspaceId: string;
  // Absolute https URL on the calling instance's frontend that the browser is
  // redirected back to after OAuth. Bound at /start by the authenticated
  // instance, so a claim can only ever land on the instance that initiated it.
  returnUrl: string;
  nonce: string;
  exp: number;
}

interface ClaimPayload {
  token: string;
  teamId: string;
  teamName: string | null;
  instanceId: string;
}

// Slack's registered redirect_uri. Must match exactly between the authorize
// leg and oauth.v2.access (Slack returns bad_redirect_uri otherwise), so both
// legs derive it from the same place.
export function getBrokerRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_URL;
  if (!base) {
    throw new Error("NEXT_PUBLIC_URL is not configured.");
  }
  return `${base}/api/broker/slack/cb`;
}

export function buildSlackAuthorizeUrl(state: string): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    throw new Error("SLACK_CLIENT_ID is not configured.");
  }
  const sp = new URLSearchParams({
    scope: SLACK_SCOPES.join(","),
    client_id: clientId,
    state,
    redirect_uri: getBrokerRedirectUri(),
  });
  return `https://slack.com/oauth/v2/authorize?${sp}`;
}

function getBrokerSigningKey(): string {
  const key = process.env.SLACK_BROKER_STATE_SECRET;
  if (!key) {
    throw new Error("SLACK_BROKER_STATE_SECRET is not configured.");
  }
  return key;
}

// The single-use state/claim records MUST live in a store shared across all
// broker workers. Without REDIS_URL the cache falls back to per-process memory,
// so on a horizontally scaled broker /cb and /redeem would hit a different
// worker than /start and never find the record — failing valid OAuth flows.
// Fail loudly at the front door (mintState) rather than silently mid-handshake.
function assertSharedStore(): void {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not configured. The Slack broker requires a shared cache (Redis).");
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signState(payloadJson: string): string {
  return crypto.createHmac("sha256", getBrokerSigningKey()).update(payloadJson).digest("base64url");
}

export function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1] : null;
}

// Authenticates a self-hosted instance by its issued key. The key is never
// stored in plaintext; we look it up by its SHA3-256 hash.
export async function authenticateInstance(instanceKey: string): Promise<string | null> {
  if (!instanceKey) {
    return null;
  }
  const keyHash = hashApiKey(instanceKey);
  const [instance] = await db
    .select({ id: slackBrokerInstances.id })
    .from(slackBrokerInstances)
    .where(eq(slackBrokerInstances.keyHash, keyHash))
    .limit(1);

  return instance?.id ?? null;
}

// Records the state's nonce server-side (bound to the minting instance) so /cb
// can consume it exactly once. The HMAC signature proves a state is authentic;
// this record makes it single-use, so a leaked/intercepted state cannot be
// replayed to pair an attacker's OAuth code with a victim's instance.
export async function mintState(input: {
  instanceId: string;
  workspaceId: string;
  returnUrl: string;
}): Promise<string> {
  assertSharedStore();
  const payload: StatePayload = {
    instanceId: input.instanceId,
    workspaceId: input.workspaceId,
    returnUrl: input.returnUrl,
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  await cache.set(
    `${STATE_PREFIX}:${payload.nonce}`,
    { instanceId: payload.instanceId },
    { expireAfterSeconds: STATE_TTL_SECONDS }
  );
  const payloadJson = JSON.stringify(payload);
  return `${base64url(payloadJson)}.${signState(payloadJson)}`;
}

export function verifyState(state: string): StatePayload | null {
  const dotIdx = state.indexOf(".");
  if (dotIdx === -1) {
    return null;
  }
  const encodedPayload = state.substring(0, dotIdx);
  const signature = state.substring(dotIdx + 1);

  let payloadJson: string;
  try {
    payloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = signState(payloadJson);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(payloadJson) as StatePayload;
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

// Atomically consumes the server-side record minted alongside this state,
// enforcing single use. Returns true exactly once per minted state; any replay
// (or a state whose record never existed/already expired) returns false. The
// instanceId match ties consumption to the instance that minted the state.
export async function consumeState(payload: StatePayload): Promise<boolean> {
  const consumed = await cache.getAndRemoveIfMatch<{ instanceId: string }>(
    `${STATE_PREFIX}:${payload.nonce}`,
    "instanceId",
    payload.instanceId
  );
  return consumed !== null;
}

const SlackTokenExchangeSchema = z.object({
  code: z.string(),
  redirectUri: z.string(),
});

// Exchanges the OAuth code for a bot token using the broker's app credentials.
export async function exchangeSlackCode(input: z.infer<typeof SlackTokenExchangeSchema>) {
  const { code, redirectUri } = SlackTokenExchangeSchema.parse(input);

  const data = await exchangeSlackOauthCode(code, redirectUri);

  return {
    token: data.access_token,
    teamId: data.team.id,
    teamName: data.team.name || null,
  };
}

export async function mintClaim(payload: ClaimPayload): Promise<string> {
  const claim = crypto.randomBytes(32).toString("base64url");
  await cache.set(`${CLAIM_PREFIX}:${claim}`, payload, { expireAfterSeconds: CLAIM_TTL_SECONDS });
  return claim;
}

// Single-use: redeeming a claim atomically reads and removes it, but only when
// the claim's instanceId matches the authenticated caller. Doing the match
// check and delete in one atomic step ensures (a) concurrent redeems can't both
// read the bot token, and (b) a mismatched-instance attempt never consumes the
// claim, so the rightful owner can still redeem it.
export async function redeemClaim(claim: string, callerInstanceId: string): Promise<ClaimPayload | null> {
  const key = `${CLAIM_PREFIX}:${claim}`;
  return cache.getAndRemoveIfMatch<ClaimPayload>(key, "instanceId", callerInstanceId);
}
