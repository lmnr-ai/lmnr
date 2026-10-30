import crypto from "crypto";

import { z } from "zod/v4";

export const ConnectStatePayloadSchema = z.object({
  nonce: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  projectId: z.string(),
  returnTo: z.string(),
  exp: z.number(),
});
export type ConnectStatePayload = z.infer<typeof ConnectStatePayloadSchema>;

function hmac(secret: string, data: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

export function signConnectState(payload: ConnectStatePayload, secret: string): string {
  const json = JSON.stringify(payload);
  return `${Buffer.from(json).toString("base64url")}.${hmac(secret, json)}`;
}

// Authenticity and expiry only; single use is enforced by consuming the nonce from the cache.
export function verifyConnectState(state: string, secret: string, now = Date.now()): ConnectStatePayload | null {
  const [encoded, signature, ...rest] = state.split(".");
  if (!encoded || !signature || rest.length > 0) return null;

  const json = Buffer.from(encoded, "base64url").toString("utf8");
  if (!safeEqual(signature, hmac(secret, json))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const payload = ConnectStatePayloadSchema.safeParse(parsed);
  if (!payload.success || payload.data.exp < Math.floor(now / 1000)) return null;
  return payload.data;
}

// X-Hub-Signature-256 is `sha256=<hex HMAC of the raw body>`.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  return safeEqual(signatureHeader, expected);
}
