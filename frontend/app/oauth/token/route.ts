import { eq } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { hashApiKey } from "@/lib/api-keys";
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/migrations/schema";
import { claimDeviceCode, getDeviceCode, recordPoll } from "@/lib/oauth/device-codes";
import { signAccessToken } from "@/lib/oauth/jwt";
import {
  getRefreshTokenByHash,
  isWithinRotationGrace,
  mintRefreshToken,
  revokeFamily,
  rotateRefreshToken,
} from "@/lib/oauth/refresh-tokens";
import { oauthError, parseOAuthBody } from "@/lib/oauth/request";

// RFC 8628 §3.4 grant-type identifier — the long string the CLI sends when
// exchanging a polled-device-code for an access token.
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

/**
 * RFC 6749 token endpoint. Handles two grant types in one POST:
 *   - `device_code` (RFC 8628): the CLI polls here after the user opens the
 *     verification URL and approves on the device page.
 *   - `refresh_token` (RFC 6749 §6): the CLI exchanges its long-lived refresh
 *     token for a fresh short-lived access token.
 *
 * Every error path returns a JSON body with an `error` field per RFC 6749
 * §5.2 — including unexpected exceptions, which `oauthError("server_error")`
 * catches in the outer try/catch.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    // Body can be application/json OR application/x-www-form-urlencoded
    // (the latter is what curl + most OAuth clients default to). The helper
    // normalises both into Record<string, string>.
    let body: Record<string, string>;
    try {
      body = await parseOAuthBody(req);
    } catch {
      return oauthError("invalid_request", "Malformed body");
    }

    // Dispatch on grant_type. RFC 6749 §5.2: an unknown grant_type returns
    // `unsupported_grant_type`, NOT `invalid_request`.
    const grantType = body.grant_type;
    if (grantType === DEVICE_GRANT) {
      return await handleDeviceCodeGrant(body);
    }
    if (grantType === "refresh_token") {
      return await handleRefreshTokenGrant(body);
    }
    return oauthError("unsupported_grant_type", `Unsupported grant_type: ${grantType ?? "<missing>"}`);
  } catch (err) {
    // Unexpected throws (DB connection failure, JWT signing error, etc.) MUST
    // still return a spec-compliant JSON body. Next.js's default
    // unhandled-error path returns a plain 500 with no body, which strict
    // OAuth clients (including `openid-client`) reject as a protocol error.
    console.error("Unhandled error in POST /oauth/token", err);
    return oauthError("server_error", "Unexpected server error");
  }
}

// -----------------------------------------------------------------------------
// Device code grant (RFC 8628 §3.4)
// -----------------------------------------------------------------------------
//
// State machine for a single device code, in the order the CLI experiences it:
//   pending      → user hasn't visited /oauth/device yet, or hasn't approved
//   approved     → user clicked Approve; row carries userId + projectId
//   claimed      → CLI successfully exchanged the code for tokens (terminal)
//   denied       → user clicked Deny (terminal)
//
// The CLI polls /oauth/token roughly every `interval` seconds (we return
// `interval: 5` from /oauth/device/authorize). On each poll, the server
// returns the right OAuth error code so the CLI knows what to do:
//   pending      → `authorization_pending` (poll again later)
//   pending (too soon) → `slow_down` (back off; cumulative 5s)
//   denied       → `access_denied` (give up)
//   expired_token → `expired_token` (15min TTL passed; give up)
//   approved     → 200 with tokens; row transitions to `claimed`
//   claimed (replay) → `expired_token` (can't reuse a one-shot device code)
async function handleDeviceCodeGrant(body: Record<string, string>): Promise<Response> {
  const deviceCode = body.device_code;
  const clientId = body.client_id;
  if (!deviceCode || !clientId) {
    return oauthError("invalid_request", "device_code and client_id are required");
  }

  const row = await getDeviceCode(deviceCode);
  if (!row) {
    return oauthError("invalid_grant", "Unknown device_code");
  }

  // Bind the device code to the client_id that originally requested it. This
  // prevents a different CLI build (with a different client_id) from picking
  // up someone else's pending approval.
  if (row.clientId !== clientId) {
    return oauthError("invalid_grant", "client_id mismatch");
  }

  const now = Date.now();
  if (new Date(row.expiresAt).getTime() < now) {
    return oauthError("expired_token");
  }

  if (row.status === "denied") {
    return oauthError("access_denied");
  }

  // Already exchanged once. Device codes are one-shot — even though the row
  // still exists for audit, we won't re-issue tokens for it. The CLI sees
  // this only if it retries after a successful exchange, which shouldn't
  // happen but is worth defending against.
  if (row.status === "claimed") {
    return oauthError("expired_token");
  }

  if (row.status === "pending") {
    // RFC 8628 §3.5 slow_down: if the CLI polled less than `interval` seconds
    // ago, tell it to back off. recordPoll() stamps lastPolledAt; we treat
    // 5s as the minimum gap (matches the `interval` we advertised at
    // authorize time).
    if (row.lastPolledAt) {
      const lastPoll = new Date(row.lastPolledAt).getTime();
      if (now - lastPoll < 5_000) {
        return oauthError("slow_down");
      }
    }
    await recordPoll(row.deviceCode);
    return oauthError("authorization_pending");
  }

  // status === 'approved' — flip the row to 'claimed' atomically. If a
  // concurrent poll already claimed it, claimDeviceCode returns null and we
  // return expired_token (the second caller lost a one-shot race).
  const claimed = await claimDeviceCode(row.deviceCode);
  if (!claimed) {
    return oauthError("expired_token", "Failed to claim device code");
  }

  return mintTokensResponse({
    userId: claimed.userId,
    projectId: claimed.projectId,
    scope: row.scope,
    clientId: row.clientId,
  });
}

// -----------------------------------------------------------------------------
// Refresh token grant (RFC 6749 §6 + RFC 9700 BCP rotation rules)
// -----------------------------------------------------------------------------
//
// Refresh tokens are stored hashed (SHA3) and grouped by `familyId`. Every
// successful exchange ROTATES the token: the presented row gets
// `rotatedAt = now()`, and a fresh row is inserted in the same family. The
// CLI throws away the old refresh token after the response lands.
//
// Reuse detection (RFC 6749 §10.4): if a row with `rotatedAt` set is
// presented again, that's either:
//   (a) a malicious replay — someone got a hold of an old token, OR
//   (b) a legitimate CLI retry — the original response was lost (network
//       failure) so the CLI is re-trying with the only token it has.
//
// We distinguish (a) vs (b) by the `isWithinRotationGrace` window (10s).
// Inside the grace window we mint a fresh successor and keep the family
// alive. Outside, we revoke the entire family. Auth0 / Okta use the same
// pattern; without the grace window, a flaky network locks the user out
// every time their CLI retries within seconds of a successful refresh
// (see better-auth#8512 for the bug this avoids).
async function handleRefreshTokenGrant(body: Record<string, string>): Promise<Response> {
  const refreshToken = body.refresh_token;
  const clientId = body.client_id;
  if (!refreshToken || !clientId) {
    return oauthError("invalid_request", "refresh_token and client_id are required");
  }

  // We never store refresh tokens in plaintext — only their hash. The CLI
  // presents the secret; we hash and look up.
  const hash = hashApiKey(refreshToken);
  const row = await getRefreshTokenByHash(hash);
  if (!row) {
    return oauthError("invalid_grant", "Unknown refresh_token");
  }

  // ----- Branch 1: token has already been rotated (potential replay) -----
  if (row.rotatedAt) {
    // Family was previously revoked (e.g. by a real replay attack earlier).
    // No grace handling — refuse permanently.
    if (row.revokedAt) {
      return oauthError("invalid_grant", "Refresh token revoked");
    }

    // Grace window: rotation happened in the last 10s. Treat as a retry
    // after a flaky network. Mint a fresh successor on the SAME family so
    // the CLI can continue. The original successor (issued in the earlier
    // call that the CLI didn't receive) stays valid too — both are usable
    // until rotated.
    if (isWithinRotationGrace(row.rotatedAt)) {
      const minted = await mintRefreshToken({
        userId: row.userId,
        projectId: row.projectId,
        scope: row.scope,
        clientId: row.clientId,
        familyId: row.familyId,
      });
      return mintTokensResponse({
        userId: row.userId,
        projectId: row.projectId,
        scope: row.scope,
        clientId: row.clientId,
        refreshTokenOverride: {
          refresh_token: minted.value,
          refresh_token_expires_in: secondsUntil(minted.expiresAt),
        },
      });
    }

    // Past the grace window: this is almost certainly a malicious replay
    // (the legitimate CLI would have updated to the new refresh token long
    // ago). Revoke every row in the family — including any not-yet-rotated
    // successor — so the attacker can't continue.
    await revokeFamily(row.familyId);
    console.warn(`OAuth refresh-token reuse detected, revoked family ${row.familyId}`);
    return oauthError("invalid_grant", "Refresh token reuse detected");
  }

  // ----- Branch 2: fresh, un-rotated refresh token -----
  if (row.revokedAt) {
    return oauthError("invalid_grant", "Refresh token revoked");
  }
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    return oauthError("invalid_grant", "Refresh token expired");
  }
  if (row.clientId !== clientId) {
    return oauthError("invalid_grant", "client_id mismatch");
  }

  // Happy path: rotate the existing row (set rotatedAt) AND insert a fresh
  // successor in the same transaction. rotateRefreshToken is the only place
  // that writes both — it returns the new plaintext token + expiry so we can
  // ship them to the CLI.
  let rotated;
  try {
    rotated = await rotateRefreshToken(hash, {
      userId: row.userId,
      projectId: row.projectId,
      scope: row.scope,
      clientId: row.clientId,
      familyId: row.familyId,
    });
  } catch (e) {
    // Rare race: between our getRefreshTokenByHash and the UPDATE inside
    // rotateRefreshToken, ANOTHER request rotated the same row first. The
    // transaction throws RotationRaceLost. Treat it the same as Branch 1:
    // if the just-completed rotation is still inside the grace window,
    // mint another successor; otherwise revoke the family.
    if (e instanceof Error && e.message === "RotationRaceLost") {
      const fresh = await getRefreshTokenByHash(hash);
      if (fresh?.rotatedAt && isWithinRotationGrace(fresh.rotatedAt)) {
        const minted = await mintRefreshToken({
          userId: row.userId,
          projectId: row.projectId,
          scope: row.scope,
          clientId: row.clientId,
          familyId: row.familyId,
        });
        return mintTokensResponse({
          userId: row.userId,
          projectId: row.projectId,
          scope: row.scope,
          clientId: row.clientId,
          refreshTokenOverride: {
            refresh_token: minted.value,
            refresh_token_expires_in: secondsUntil(minted.expiresAt),
          },
        });
      }
      await revokeFamily(row.familyId);
      return oauthError("invalid_grant", "Refresh token race");
    }
    throw e;
  }

  // Normal rotation: return the freshly-minted refresh token alongside a new
  // access token. The CLI replaces its local credentials atomically.
  return mintTokensResponse({
    userId: row.userId,
    projectId: row.projectId,
    scope: row.scope,
    clientId: row.clientId,
    refreshTokenOverride: {
      refresh_token: rotated.value,
      refresh_token_expires_in: secondsUntil(rotated.expiresAt),
    },
  });
}

// -----------------------------------------------------------------------------
// Token response builder
// -----------------------------------------------------------------------------
//
// Mints the JWT access token from the claims passed in. If the caller already
// has a refresh token to return (refresh path), we use that — otherwise we
// mint a fresh one (device-code path). Response shape follows RFC 6749 §5.1.

interface MintInput {
  userId: string;
  projectId: string;
  scope: string;
  clientId: string;
  // When set, use this refresh_token in the response instead of minting a new
  // one. Used by the refresh-token grant (the new refresh was already minted
  // inside the rotation transaction).
  refreshTokenOverride?: { refresh_token: string; refresh_token_expires_in: number };
}

async function mintTokensResponse(input: MintInput): Promise<Response> {
  // The user's email goes into the JWT's `email` claim (for log lines and
  // future per-user scopes). If we can't find the user we fall back to "" —
  // we don't fail the token mint just because the user record is missing.
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1);
  const email = user?.email ?? "";

  const access = await signAccessToken({
    userId: input.userId,
    email,
    projectId: input.projectId,
    scope: input.scope,
    clientId: input.clientId,
  });

  // refresh_token is either supplied (refresh grant — already minted inside
  // the rotation transaction) or freshly minted (device-code grant — first
  // exchange after approval).
  const refreshPayload =
    input.refreshTokenOverride ??
    (await (async () => {
      const minted = await mintRefreshToken({
        userId: input.userId,
        projectId: input.projectId,
        scope: input.scope,
        clientId: input.clientId,
      });
      return {
        refresh_token: minted.value,
        refresh_token_expires_in: secondsUntil(minted.expiresAt),
      };
    })());

  return new Response(
    JSON.stringify({
      access_token: access.token,
      token_type: "Bearer",
      expires_in: access.expiresInSeconds,
      refresh_token: refreshPayload.refresh_token,
      refresh_token_expires_in: refreshPayload.refresh_token_expires_in,
      scope: input.scope,
    }),
    {
      status: 200,
      headers: {
        // RFC 6749 §5.1 SHOULD recommendation — token responses must not be
        // cached by intermediaries.
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    }
  );
}

/**
 * Seconds from now until the given timestamp (rounded down). The value goes
 * into the OAuth `*_expires_in` fields, which are integer seconds.
 */
function secondsUntil(at: Date | string): number {
  const ms = new Date(at).getTime() - Date.now();
  return Math.floor(ms / 1000);
}
