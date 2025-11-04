import { createHash, randomBytes } from 'crypto';

export function generateRandomKey(): string {
  // Generate a 64-character alphanumeric string
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = randomBytes(64);

  for (let i = 0; i < 64; i++) {
    result += chars[bytes[i] % chars.length];
  }

  return result;
}

export function hashApiKey(apiKey: string): string {
  // SHA3-256 hash, return hex string
  const hash = createHash('sha3-256');
  hash.update(apiKey);
  return hash.digest('hex');
}

export interface ProjectApiKeyVals {
  value: string;
  hash: string;
  shorthand: string;
}

export function createProjectApiKey(): ProjectApiKeyVals {
  const value = generateRandomKey();
  const hash = hashApiKey(value);
  const shorthand = `${value.slice(0, 4)}...${value.slice(-4)}`;

  return {
    value,
    hash,
    shorthand,
  };
}

