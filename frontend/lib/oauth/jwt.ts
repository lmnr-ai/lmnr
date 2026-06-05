import { randomUUID } from "crypto";
import { SignJWT } from "jose";

import { getOrCreateActiveSigningKey } from "@/lib/oauth/signing-key";

export const AUDIENCE = "lmnr-app-server";

export function getIssuer(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3010";
}

export interface SignAccessTokenInput {
  userId: string;
  email: string;
  projectId: string;
  scope: string;
  clientId: string;
}

export interface SignedAccessToken {
  token: string;
  expiresInSeconds: number;
  jti: string;
}

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h

export async function signAccessToken(input: SignAccessTokenInput): Promise<SignedAccessToken> {
  const { kid, privateKey } = await getOrCreateActiveSigningKey();
  const jti = randomUUID();
  const issuer = getIssuer();
  const token = await new SignJWT({
    email: input.email,
    project_id: input.projectId,
    scope: input.scope,
    client_id: input.clientId,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid })
    .setSubject(input.userId)
    .setIssuer(issuer)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .setJti(jti)
    .sign(privateKey);

  return { token, expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS, jti };
}
