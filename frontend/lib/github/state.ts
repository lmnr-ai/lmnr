import crypto from "crypto";

import { cache } from "@/lib/cache";
import { githubAppConfig } from "@/lib/github/config";
import { type ConnectStatePayload, signConnectState, verifyConnectState } from "@/lib/github/signing";

const STATE_TTL_SECONDS = 600;
const STATE_NONCE_KEY = (nonce: string) => `github_connect_state:${nonce}`;
const PENDING_STATE_KEY = (userId: string) => `github_connect_pending:${userId}`;

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
  const state = signConnectState(payload, githubAppConfig.stateSecret());
  await cache.set(
    PENDING_STATE_KEY(payload.userId),
    { userId: payload.userId, state },
    { expireAfterSeconds: STATE_TTL_SECONDS }
  );
  return state;
}

// GitHub sometimes drops `state` on the setup redirect; recover the user's latest flow from the session.
export async function takePendingConnectState(userId: string): Promise<string | null> {
  const pending = await cache.getAndRemoveIfMatch<{ state: string }>(PENDING_STATE_KEY(userId), "userId", userId);
  return pending?.state ?? null;
}

export function verifyState(state: string): ConnectStatePayload | null {
  return verifyConnectState(state, githubAppConfig.stateSecret());
}

// Single use: the HMAC alone would let a leaked state be replayed.
export async function consumeConnectState(payload: ConnectStatePayload): Promise<boolean> {
  const consumed = await cache.getAndRemoveIfMatch(STATE_NONCE_KEY(payload.nonce), "userId", payload.userId);
  return consumed !== null;
}
