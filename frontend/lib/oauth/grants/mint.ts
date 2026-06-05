import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/migrations/schema";
import { signAccessToken } from "@/lib/oauth/jwt";
import { mintRefreshToken, type MintRefreshTokenInput, type RefreshTokenRow } from "@/lib/oauth/refresh-tokens";

/**
 * Inputs to the token-endpoint response builder. `refreshTokenOverride` is
 * supplied by the refresh-token grant (it already minted the new refresh
 * inside its rotation transaction); the device-code grant omits it and lets
 * `mintTokensResponse` mint a fresh refresh on the first exchange.
 */
export interface MintInput {
  userId: string;
  projectId: string;
  scope: string;
  clientId: string;
  refreshTokenOverride?: { refresh_token: string; refresh_token_expires_in: number };
}

/**
 * RFC 6749 §5.1 token endpoint response builder. Mints the JWT access token
 * from the claims passed in; either uses the supplied refresh token or mints
 * a fresh one. Always emits `cache-control: no-store` so intermediaries don't
 * cache the response.
 */
export async function mintTokensResponse(input: MintInput): Promise<Response> {
  // Email goes into the JWT for log lines + future per-user scopes. If the
  // user row is gone we fall back to "" rather than failing the mint.
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1);
  const email = user?.email ?? "";

  const access = await signAccessToken({
    userId: input.userId,
    email,
    projectId: input.projectId,
    scope: input.scope,
    clientId: input.clientId,
  });

  let refreshPayload = input.refreshTokenOverride;
  if (!refreshPayload) {
    const minted = await mintRefreshToken({
      userId: input.userId,
      projectId: input.projectId,
      scope: input.scope,
      clientId: input.clientId,
    });
    refreshPayload = {
      refresh_token: minted.value,
      refresh_token_expires_in: secondsUntil(minted.expiresAt),
    };
  }

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

/**
 * Inside the rotation grace window (RFC 9700 / Auth0 default), a retried
 * presentation of a recently-rotated refresh token is treated as the
 * legitimate CLI re-trying after a flaky network — mint a fresh successor on
 * the SAME family and respond as if rotation just happened. Outside the
 * grace window, the caller should revoke the family instead (NOT this
 * helper's job — see refresh.ts).
 */
export async function graceRetryResponse(row: RefreshTokenRow): Promise<Response> {
  const next: MintRefreshTokenInput = {
    userId: row.userId,
    projectId: row.projectId,
    scope: row.scope,
    clientId: row.clientId,
    familyId: row.familyId,
  };
  const minted = await mintRefreshToken(next);
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

/**
 * Seconds from now until the given timestamp (rounded down). Goes into the
 * OAuth `*_expires_in` integer-second fields.
 */
export function secondsUntil(at: Date | string): number {
  const ms = new Date(at).getTime() - Date.now();
  return Math.floor(ms / 1000);
}
