import _sodium from "libsodium-wrappers";

/** `Buffer.from(hex)` stops at the first non-hex character, so a malformed key would silently shrink. */
async function hexKeyFromEnv(name: "AEAD_SECRET_KEY" | "SLACK_ENCRYPTION_KEY"): Promise<Uint8Array> {
  await _sodium.ready;
  const keyHex = process.env[name];
  if (!keyHex) {
    throw new Error(`${name} environment variable is not set`);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(`${name} must be 64 hex characters (32 bytes), got ${keyHex.length} characters`);
  }
  return Buffer.from(keyHex, "hex");
}

const getKeyFromEnv = () => hexKeyFromEnv("AEAD_SECRET_KEY");
const getSlackKeyFromEnv = () => hexKeyFromEnv("SLACK_ENCRYPTION_KEY");

export async function encodeApiKey(name: string, value: string): Promise<{ value: string; nonce: string }> {
  const key = await getKeyFromEnv();
  try {
    await _sodium.ready;

    const nonce = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const additionalData = new TextEncoder().encode(name);

    const encrypted = _sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      new TextEncoder().encode(value),
      additionalData,
      null,
      nonce,
      key
    );

    return {
      value: Buffer.from(encrypted).toString("hex"),
      nonce: Buffer.from(nonce).toString("hex"),
    };
  } catch (error) {
    throw new Error(`Failed to encode api_key ${name}`, {
      cause: error,
    });
  }
}

export async function decodeApiKey(name: string, nonce: string, value: string): Promise<string> {
  const key = await getKeyFromEnv();
  try {
    await _sodium.ready;

    const nonceBytes = Buffer.from(nonce, "hex");
    const encryptedBytes = Buffer.from(value, "hex");
    const additionalData = new TextEncoder().encode(name);

    const decrypted = _sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      encryptedBytes,
      additionalData,
      nonceBytes,
      key
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new Error(`Failed to decode api_key ${name}`, {
      cause: error,
    });
  }
}

export async function encodeSlackToken(teamId: string, token: string): Promise<{ value: string; nonce: string }> {
  const key = await getSlackKeyFromEnv();
  try {
    await _sodium.ready;

    const nonce = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const additionalData = new TextEncoder().encode(teamId);

    const encrypted = _sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      new TextEncoder().encode(token),
      additionalData,
      null,
      nonce,
      key
    );

    return {
      value: Buffer.from(encrypted).toString("hex"),
      nonce: Buffer.from(nonce).toString("hex"),
    };
  } catch (error) {
    throw new Error(`Failed to encode Slack token for team ${teamId}`, {
      cause: error,
    });
  }
}

export async function decodeSlackToken(teamId: string, nonceHex: string, encryptedValue: string): Promise<string> {
  const key = await getSlackKeyFromEnv();
  try {
    await _sodium.ready;

    const nonceBytes = Buffer.from(nonceHex, "hex");
    const encryptedBytes = Buffer.from(encryptedValue, "hex");
    const additionalData = new TextEncoder().encode(teamId);

    const decrypted = _sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      encryptedBytes,
      additionalData,
      nonceBytes,
      key
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new Error(`Failed to decode Slack token for team ${teamId}`, {
      cause: error,
    });
  }
}

export async function encryptValue(additionalData: string, value: string): Promise<{ value: string; nonce: string }> {
  const key = await getKeyFromEnv();
  try {
    await _sodium.ready;

    const nonce = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const additionalDataEncoded = new TextEncoder().encode(additionalData);

    const encrypted = _sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      new TextEncoder().encode(value),
      additionalDataEncoded,
      null,
      nonce,
      key
    );

    return {
      value: Buffer.from(encrypted).toString("hex"),
      nonce: Buffer.from(nonce).toString("hex"),
    };
  } catch (error) {
    throw new Error(`Failed to encode value with additional data: ${additionalData}`, {
      cause: error,
    });
  }
}

export async function decryptValue(additionalData: string, nonce: string, value: string): Promise<string> {
  const key = await getKeyFromEnv();
  try {
    await _sodium.ready;

    const nonceBytes = Buffer.from(nonce, "hex");
    const encryptedBytes = Buffer.from(value, "hex");
    const additionalDataEncoded = new TextEncoder().encode(additionalData);

    const decrypted = _sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      encryptedBytes,
      additionalDataEncoded,
      nonceBytes,
      key
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new Error(`Failed to decode value with additional data: ${additionalData}`, {
      cause: error,
    });
  }
}

export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  try {
    await _sodium.ready;
    const keyPair = _sodium.crypto_sign_keypair();

    return {
      publicKey: Buffer.from(keyPair.publicKey).toString("base64"),
      privateKey: Buffer.from(keyPair.privateKey).toString("base64"),
    };
  } catch (error) {
    throw new Error(`Failed to generate Ed25519 key pair`, {
      cause: error,
    });
  }
}
