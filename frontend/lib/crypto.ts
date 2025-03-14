import { crypto_aead_xchacha20poly1305_ietf_decrypt, ready } from "libsodium-wrappers";

interface ValueAndNonce {
  value: string;
  nonce: string;
}

async function getKeyFromEnv(): Promise<Uint8Array> {
  await ready;
  const keyHex = process.env.AEAD_SECRET_KEY;
  if (!keyHex) {
    throw new Error("AEAD_SECRET_KEY environment variable is not set");
  }
  return Buffer.from(keyHex, "hex");
}

export async function decodeApiKey(name: string, nonce: string, value: string): Promise<string> {
  try {
    await ready;
    const key = await getKeyFromEnv();

    const nonceBytes = Buffer.from(nonce, "hex");
    const encryptedBytes = Buffer.from(value, "hex");
    const additionalData = new TextEncoder().encode(name);

    const decrypted = crypto_aead_xchacha20poly1305_ietf_decrypt(null, encryptedBytes, additionalData, nonceBytes, key);
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new Error(`Failed to decode api_key ${name}`);
  }
}
