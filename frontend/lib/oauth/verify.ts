import { createLocalJWKSet, type JWTPayload, jwtVerify } from "jose";

import { AUDIENCE, getIssuer } from "@/lib/oauth/jwt";
import { getAllPublicJwks } from "@/lib/oauth/signing-key";

export interface VerifiedAccessTokenClaims extends JWTPayload {
  sub: string;
  email: string;
  project_id: string;
  scope: string;
  client_id?: string;
  jti: string;
}

/**
 * Extract a Bearer token from an Authorization header. Returns null if the
 * header is absent or malformed.
 */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Quick syntactic check — three base64url segments. Real validation lives in
 * `verifyAccessToken`; this just avoids hitting the JWKS fetch path with
 * obviously non-JWT tokens (e.g. API keys).
 */
export function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3;
}

/**
 * Validate a JWT minted by our `/oauth/token` endpoint and return its claims.
 * Mirrors the Rust validator in `app-server/src/auth/jwt.rs`:
 *   - RS256 only.
 *   - Issuer == NEXTAUTH_URL (trailing slash trimmed).
 *   - Audience == "lmnr-app-server".
 *   - Requires exp/iat/iss/aud/sub.
 *   - Keys come from `getAllPublicJwks()` (same source as `/oauth/jwks`).
 */
export async function verifyAccessToken(token: string): Promise<VerifiedAccessTokenClaims> {
  const jwks = await getAllPublicJwks();
  if (jwks.length === 0) {
    throw new Error("No active signing keys available");
  }
  const keyset = createLocalJWKSet({ keys: jwks });
  const issuer = getIssuer().replace(/\/+$/, "");
  const { payload } = await jwtVerify(token, keyset, {
    issuer,
    audience: AUDIENCE,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat", "iss", "aud", "sub", "jti"],
  });

  if (typeof payload.sub !== "string" || typeof payload.jti !== "string") {
    throw new Error("JWT missing required claims");
  }
  if (typeof payload.email !== "string" || typeof payload.project_id !== "string") {
    throw new Error("JWT missing email/project_id claims");
  }

  return payload as VerifiedAccessTokenClaims;
}
