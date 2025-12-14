import sodium from 'libsodium-wrappers';

async function getKeyFromEnv(): Promise<Uint8Array> {
  await sodium.ready;
  const keyHex = process.env.AEAD_SECRET_KEY;

  if (!keyHex) {
    throw new Error('AEAD_SECRET_KEY environment variable is not set');
  }

  return Buffer.from(keyHex, 'hex');
}

export async function decryptApiKey(name: string, nonceHex: string, valueHex: string): Promise<string> {
  try {
    await sodium.ready;
    const key = await getKeyFromEnv();

    const nonce = Buffer.from(nonceHex, 'hex');
    const encryptedBytes = Buffer.from(valueHex, 'hex');
    const additionalData = new TextEncoder().encode(name);

    const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      encryptedBytes,
      additionalData,
      nonce,
      key
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to decode api_key ${name}`);
  }
}
