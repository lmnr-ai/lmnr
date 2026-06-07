import { randomUUID } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

// The one-time CLI-login "authorization code" is a short-lived HS256 JWS minted
// with NEXTAUTH_SECRET. It binds the approving user's chosen project to the
// PKCE code_challenge; the CLI later redeems it at /api/cli-login/token by
// presenting the matching code_verifier.
//
// Accepted replay residual: we keep NO seen-jti set, so a code is technically
// replayable within its 60s window. This is acceptable because redeeming it
// also requires the matching code_verifier, which never leaves the CLI process
// that minted the challenge. Do NOT add a Redis/DB seen-set for this.

const AUDIENCE = "cli-login-code";
const TTL_SECONDS = 60;

function secret(): Uint8Array {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) {
    throw new Error("NEXTAUTH_SECRET is not set — cannot mint CLI-login codes");
  }
  return new TextEncoder().encode(value);
}

export interface CodeClaims {
  projectId: string;
  userId: string;
  codeChallenge: string;
}

export async function mintCode(claims: CodeClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    projectId: claims.projectId,
    userId: claims.userId,
    codeChallenge: claims.codeChallenge,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .setAudience(AUDIENCE)
    .sign(secret());
}

// Throws on bad signature, expiry, or audience mismatch.
export async function verifyCode(code: string): Promise<CodeClaims & { jti: string }> {
  const { payload } = await jwtVerify(code, secret(), { audience: AUDIENCE });
  const { projectId, userId, codeChallenge, jti } = payload as Record<string, unknown>;
  if (
    typeof projectId !== "string" ||
    typeof userId !== "string" ||
    typeof codeChallenge !== "string" ||
    typeof jti !== "string"
  ) {
    throw new Error("Malformed CLI-login code claims");
  }
  return { projectId, userId, codeChallenge, jti };
}
