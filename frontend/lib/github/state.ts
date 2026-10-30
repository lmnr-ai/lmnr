import crypto from "crypto";

import { cache } from "@/lib/cache";
import { githubAppConfig } from "@/lib/github/config";
import { type ConnectStatePayload, signConnectState, verifyConnectState } from "@/lib/github/signing";

const STATE_TTL_SECONDS = 600;
const STATE_NONCE_KEY = (nonce: string) => `github_connect_state:${nonce}`;

export async function mintConnectState(input: Omit<ConnectStatePayload, "nonce" | "exp">): Promise<string> {
  const payload: ConnectStatePayload = {
    ...input,
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  await cache.set(
    STATE_NONCE_KEY(payload.nonce),
    { userId: payload.userId },
    { expireAfterSeconds: STATE_TTL_SECONDS }
  );
  return signConnectState(payload, githubAppConfig.stateSecret());
}

export function verifyState(state: string): ConnectStatePayload | null {
  return verifyConnectState(state, githubAppConfig.stateSecret());
}

// Single use: the HMAC alone would let a leaked state be replayed.
export async function consumeConnectState(payload: ConnectStatePayload): Promise<boolean> {
  const consumed = await cache.getAndRemoveIfMatch(STATE_NONCE_KEY(payload.nonce), "userId", payload.userId);
  return consumed !== null;
}
