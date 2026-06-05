import { hashApiKey } from "@/lib/api-keys";
import { graceRetryResponse, mintTokensResponse, secondsUntil } from "@/lib/oauth/grants/mint";
import {
  getRefreshTokenByHash,
  isWithinRotationGrace,
  revokeFamily,
  rotateRefreshToken,
} from "@/lib/oauth/refresh-tokens";
import { oauthError } from "@/lib/oauth/request";

/**
 * RFC 6749 §6 refresh-token grant. Refresh tokens are stored hashed (SHA3)
 * and grouped by `familyId`. Every successful exchange rotates the token:
 * the presented row is marked `rotatedAt = now()` and a fresh row is inserted
 * in the same family. The CLI throws away the old refresh token after the
 * response lands.
 *
 * Reuse detection (RFC 6749 §10.4): if a row with `rotatedAt` set is
 * presented again, that's either:
 *   (a) malicious replay — someone got hold of an old token, OR
 *   (b) legitimate CLI retry — the original response was lost (network
 *       failure) so the CLI re-tries with the only token it has.
 *
 * We distinguish (a) vs (b) by `isWithinRotationGrace` (10s). Inside the
 * window → mint a fresh successor on the same family. Outside → revoke the
 * entire family. Auth0 / Okta use the same pattern; without the grace
 * window, a flaky network locks the user out every time the CLI retries
 * within seconds of a successful refresh.
 */
export async function handleRefreshTokenGrant(body: Record<string, string>): Promise<Response> {
  const refreshToken = body.refresh_token;
  const clientId = body.client_id;
  if (!refreshToken || !clientId) {
    return oauthError("invalid_request", "refresh_token and client_id are required");
  }

  // We never store refresh tokens in plaintext — only their hash. CLI
  // presents the secret; we hash and look up.
  const hash = hashApiKey(refreshToken);
  const row = await getRefreshTokenByHash(hash);
  if (!row) {
    return oauthError("invalid_grant", "Unknown refresh_token");
  }

  // ----- Branch 1: token has already been rotated (potential replay) -----
  if (row.rotatedAt) {
    if (row.revokedAt) {
      return oauthError("invalid_grant", "Refresh token revoked");
    }
    if (isWithinRotationGrace(row.rotatedAt)) {
      return graceRetryResponse(row);
    }
    // Past the grace window. Almost certainly a malicious replay (the
    // legitimate CLI would have updated to the new refresh token long ago).
    // Revoke every row in the family — including any not-yet-rotated
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

  // Happy path: rotate the existing row + insert a fresh successor inside
  // one transaction. rotateRefreshToken returns the new plaintext + expiry.
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
    // Rare race: another request rotated the same row between our SELECT
    // and our UPDATE. Treat as Branch 1 — if the just-completed rotation is
    // still in the grace window, mint another successor; otherwise revoke.
    if (e instanceof Error && e.message === "RotationRaceLost") {
      const fresh = await getRefreshTokenByHash(hash);
      if (fresh?.rotatedAt && isWithinRotationGrace(fresh.rotatedAt)) {
        return graceRetryResponse(row);
      }
      await revokeFamily(row.familyId);
      return oauthError("invalid_grant", "Refresh token race");
    }
    throw e;
  }

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
