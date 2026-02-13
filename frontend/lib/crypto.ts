import _sodium from "libsodium-wrappers";

async function getKeyFromEnv(): Promise<Uint8Array> {
  await _sodium.ready;
  const keyHex = process.env.AEAD_SECRET_KEY;
  if (!keyHex) {
    throw new Error("AEAD_SECRET_KEY environment variable is not set");
  }
  return Buffer.from(keyHex, "hex");
}

async function getSlackKeyFromEnv(): Promise<Uint8Array> {
  await _sodium.ready;
  const keyHex = process.env.SLACK_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error("SLACK_ENCRYPTION_KEY environment variable is not set");
  }
  return Buffer.from(keyHex, "hex");
}

export async function encodeApiKey(name: string, value: string): Promise<{ value: string; nonce: string }> {
  try {
    await _sodium.ready;
    const key = await getKeyFromEnv();

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
    throw new Error(`Failed to encode api_key ${name}`);
  }
}

export async function decodeApiKey(name: string, nonce: string, value: string): Promise<string> {
  try {
    await _sodium.ready;
    const key = await getKeyFromEnv();

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
    throw new Error(`Failed to decode api_key ${name}`);
  }
}

export async function encodeSlackToken(teamId: string, token: string): Promise<{ value: string; nonce: string }> {
  try {
    await _sodium.ready;
    const key = await getSlackKeyFromEnv(); // Use Slack-specific key

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
    throw new Error(`Failed to encode Slack token for team ${teamId}`);
  }
}

export async function encryptValue(
  additionalData: string,
  value: string
): Promise<{ value: string; nonce: string }> {
  try {
    await _sodium.ready;
    const key = await getKeyFromEnv();

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
    throw new Error(`Failed to encode value with additional data: ${additionalData}`);
  }
}

export async function decryptValue(additionalData: string, nonce: string, value: string): Promise<string> {
  try {
    await _sodium.ready;
    const key = await getKeyFromEnv();

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
    throw new Error(`Failed to decode value with additional data: ${additionalData}`);
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
    throw new Error(`Failed to generate Ed25519 key pair`);
  }
}
