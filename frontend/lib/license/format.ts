import crypto from "crypto";

// Enterprise license keys: `lmnr_lic_<payload>.<signature>`, both segments
// base64url without padding. The signature is Ed25519 over the payload segment's
// ASCII bytes, so keys verify offline (air-gapped installs) against the public
// keys compiled into the app-server. The app-server is the enforcing verifier;
// this copy serves the Cloud Slack broker and the minting script.
export const LICENSE_PREFIX = "lmnr_lic_";

// A key signed by any of these verifies; spare pairs let us switch signing keys
// without breaking deployed images. Keep in sync with PUBLIC_KEYS in
// app-server/src/license/key.rs.
export const LICENSE_PUBLIC_KEYS: readonly string[] = ["n8Iz5CFM5PXtKaNeFjri0gZ6_RFouS61xJIa5PdNE4g"];

const SUPPORTED_VERSION = 1;

// DER header that turns a raw 32-byte Ed25519 seed into a PKCS#8 private key.
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export interface LicensePayload {
  v: number;
  licenseId: string;
  customer: string;
  // Unix seconds.
  issuedAt: number;
  // Unix seconds; null for a perpetual license.
  expiresAt: number | null;
}

const privateKeyFromSeed = (seed: Buffer): crypto.KeyObject => {
  if (seed.length !== 32) {
    throw new Error(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
  }
  return crypto.createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
};

const publicKeyFromBase64Url = (publicKey: string): crypto.KeyObject =>
  crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKey }, format: "jwk" });

export const publicKeyFromSeed = (seed: Buffer): string => {
  const jwk = crypto.createPublicKey(privateKeyFromSeed(seed)).export({ format: "jwk" });
  if (!jwk.x) {
    throw new Error("Failed to derive Ed25519 public key");
  }
  return jwk.x;
};

export const signLicense = (payload: LicensePayload, seed: Buffer): string => {
  const payloadSegment = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.sign(null, Buffer.from(payloadSegment), privateKeyFromSeed(seed));
  return `${LICENSE_PREFIX}${payloadSegment}.${signature.toString("base64url")}`;
};

// Returns the payload when the signature verifies, null otherwise. Expiry is not
// checked here: callers decide how an expired license is treated.
export const verifyLicense = (
  key: string,
  publicKeys: readonly string[] = LICENSE_PUBLIC_KEYS
): LicensePayload | null => {
  const trimmed = key.trim();
  if (!trimmed.startsWith(LICENSE_PREFIX)) {
    return null;
  }
  const [payloadSegment, signatureSegment, ...rest] = trimmed.slice(LICENSE_PREFIX.length).split(".");
  if (!payloadSegment || !signatureSegment || rest.length > 0) {
    return null;
  }

  try {
    const signature = Buffer.from(signatureSegment, "base64url");
    const valid = publicKeys.some((publicKey) =>
      crypto.verify(null, Buffer.from(payloadSegment), publicKeyFromBase64Url(publicKey), signature)
    );
    if (!valid) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8")) as LicensePayload;
    if (payload.v !== SUPPORTED_VERSION || typeof payload.licenseId !== "string") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

// Same rule as the app-server: a license stops at its expiresAt, with no grace period.
export const isLicenseExpired = (license: LicensePayload, now: number = Date.now()): boolean =>
  license.expiresAt !== null && Math.floor(now / 1000) >= license.expiresAt;
