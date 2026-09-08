import { decryptValue } from "@/lib/crypto";

import { type LlmProfileSecrets, LlmProfileSecretsSchema } from "./schema";

export type EncryptedSecrets = { nonce: string; value: string };

/** Read side only: writes (and encryption) live in the app-server. `aad` is the profile id. */
export async function decryptSecrets(aad: string, encrypted: unknown): Promise<LlmProfileSecrets> {
  const { nonce, value } = encrypted as EncryptedSecrets;
  const raw = await decryptValue(aad, nonce, value);
  return LlmProfileSecretsSchema.parse(JSON.parse(raw));
}
