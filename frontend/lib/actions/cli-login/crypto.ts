import nacl from "tweetnacl";

// CLI auth uses TweetNaCl box (X25519 + XSalsa20-Poly1305) for at-rest
// confidentiality of the minted project API key. The CLI sends its 32-byte
// public key; the server generates an ephemeral keypair + 24-byte nonce,
// encrypts the payload, persists the ciphertext + nonce + ephemeral public,
// and discards the ephemeral secret.

export const PUBLIC_KEY_BYTES = 32;
export const NONCE_BYTES = 24;

export const decodeBase64Url = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64url"));

export const encodeBase64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

export interface EncryptResult {
  encryptedPayload: string;
  encryptedNonce: string;
  ephemeralPublicKey: string;
}

export const encryptPayload = (payload: string, recipientPublicKeyB64Url: string): EncryptResult => {
  const recipientPublicKey = decodeBase64Url(recipientPublicKeyB64Url);
  if (recipientPublicKey.length !== PUBLIC_KEY_BYTES) {
    throw new Error(`Recipient public key must be ${PUBLIC_KEY_BYTES} bytes, got ${recipientPublicKey.length}`);
  }
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(NONCE_BYTES);
  const message = new TextEncoder().encode(payload);
  const encrypted = nacl.box(message, nonce, recipientPublicKey, ephemeral.secretKey);
  // ephemeral.secretKey goes out of scope here; node has no zeroize primitive,
  // but the GC reclaims it shortly after — same posture as Supabase's flow.
  return {
    encryptedPayload: encodeBase64Url(encrypted),
    encryptedNonce: encodeBase64Url(nonce),
    ephemeralPublicKey: encodeBase64Url(ephemeral.publicKey),
  };
};

export const isValidPublicKey = (s: string): boolean => {
  try {
    return decodeBase64Url(s).length === PUBLIC_KEY_BYTES;
  } catch {
    return false;
  }
};
