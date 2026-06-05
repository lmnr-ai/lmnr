import { randomBytes } from "crypto";

// Crockford base32 alphabet (excludes I, L, O, U to avoid lookalikes).
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 8-char user code formatted as XXXX-XXXX. Crypto-random. */
export function generateUserCode(): string {
  const bytes = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += CROCKFORD[bytes[i] & 31];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** 64 random bytes, base64url-encoded. The device_code itself, never echoed back to the user. */
export function generateDeviceCode(): string {
  return randomBytes(48).toString("base64url");
}

/** 64 random bytes, base64url-encoded. The refresh_token itself. */
export function generateRefreshToken(): string {
  return randomBytes(64).toString("base64url");
}
