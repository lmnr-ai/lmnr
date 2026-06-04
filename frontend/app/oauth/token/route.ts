import { eq } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { hashApiKey } from "@/lib/api-keys";
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/migrations/schema";
import { claimDeviceCode, getDeviceCode, recordPoll } from "@/lib/oauth/device-codes";
import { signAccessToken } from "@/lib/oauth/jwt";
import { getRefreshTokenByHash, mintRefreshToken, revokeFamily, rotateRefreshToken } from "@/lib/oauth/refresh-tokens";
import { oauthError, parseOAuthBody } from "@/lib/oauth/request";

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export async function POST(req: NextRequest): Promise<Response> {
  let body: Record<string, string>;
  try {
    body = await parseOAuthBody(req);
  } catch {
    return oauthError("invalid_request", "Malformed body");
  }

  const grantType = body.grant_type;
  if (grantType === DEVICE_GRANT) {
    return handleDeviceCodeGrant(body);
  }
  if (grantType === "refresh_token") {
    return handleRefreshTokenGrant(body);
  }
  return oauthError("unsupported_grant_type", `Unsupported grant_type: ${grantType ?? "<missing>"}`);
}

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

  if (row.status === "claimed") {
    // Already exchanged once.
    return oauthError("expired_token");
  }

  if (row.status === "pending") {
    if (row.lastPolledAt) {
      const lastPoll = new Date(row.lastPolledAt).getTime();
      if (now - lastPoll < 5_000) {
        return oauthError("slow_down");
      }
    }
    await recordPoll(row.deviceCode);
    return oauthError("authorization_pending");
  }

  // status === 'approved' — try to atomically claim.
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

async function handleRefreshTokenGrant(body: Record<string, string>): Promise<Response> {
  const refreshToken = body.refresh_token;
  const clientId = body.client_id;
  if (!refreshToken || !clientId) {
    return oauthError("invalid_request", "refresh_token and client_id are required");
  }
  const hash = hashApiKey(refreshToken);
  const row = await getRefreshTokenByHash(hash);
  if (!row) {
    return oauthError("invalid_grant", "Unknown refresh_token");
  }

  // Reuse-detection: a token already rotated to a successor was just presented again.
  // RFC 6749 §10.4 / OAuth 2.1: revoke the entire family.
  if (row.rotatedAt) {
    await revokeFamily(row.familyId);
    console.warn(`OAuth refresh-token reuse detected, revoked family ${row.familyId}`);
    return oauthError("invalid_grant", "Refresh token reuse detected");
  }

  if (row.revokedAt) {
    return oauthError("invalid_grant", "Refresh token revoked");
  }
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    return oauthError("invalid_grant", "Refresh token expired");
  }
  if (row.clientId !== clientId) {
    return oauthError("invalid_grant", "client_id mismatch");
  }

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
    if (e instanceof Error && e.message === "RotationRaceLost") {
      // Someone rotated between our SELECT and UPDATE — treat as reuse.
      await revokeFamily(row.familyId);
      return oauthError("invalid_grant", "Refresh token race");
    }
    throw e;
  }

  const refreshOut = {
    refresh_token: rotated.value,
    refresh_token_expires_in: Math.floor((new Date(rotated.expiresAt).getTime() - Date.now()) / 1000),
  };

  return mintTokensResponse({
    userId: row.userId,
    projectId: row.projectId,
    scope: row.scope,
    clientId: row.clientId,
    refreshTokenOverride: refreshOut,
  });
}

interface MintInput {
  userId: string;
  projectId: string;
  scope: string;
  clientId: string;
  refreshTokenOverride?: { refresh_token: string; refresh_token_expires_in: number };
}

async function mintTokensResponse(input: MintInput): Promise<Response> {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1);
  const email = user?.email ?? "";

  const access = await signAccessToken({
    userId: input.userId,
    email,
    projectId: input.projectId,
    scope: input.scope,
    clientId: input.clientId,
  });

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
        refresh_token_expires_in: Math.floor((new Date(minted.expiresAt).getTime() - Date.now()) / 1000),
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
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    }
  );
}
