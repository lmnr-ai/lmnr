// Mints a signed enterprise license key for a self-hosted customer.
//
// The signing key is an Ed25519 seed whose public half is in LICENSE_PUBLIC_KEYS
// (frontend/lib/license/format.ts) and PUBLIC_KEYS (app-server/src/license/key.rs).
// Seeds live in the secret manager, never in the repo or an env file. Only one
// signs at a time; the others are spares for when a seed leaks.
//
//   pnpm license:keygen                                         new signing key + public key
//   LMNR_LICENSE_SIGNING_KEY=… pnpm license:mint "Acme Corp" --expires 2027-10-31
//   LMNR_LICENSE_SIGNING_KEY=… pnpm license:mint "Laminar Cloud" --perpetual
//
// The customer sets the printed key as LMNR_LICENSE_KEY or pastes it into
// Settings → License. Keys verify offline, so they can't be revoked: match
// --expires to the contract end.
import crypto from "crypto";

import { LICENSE_PUBLIC_KEYS, publicKeyFromSeed, signLicense, verifyLicense } from "@/lib/license/format";

const usage = () => {
  console.error("Usage:");
  console.error("  pnpm license:keygen");
  console.error('  LMNR_LICENSE_SIGNING_KEY=<seed> pnpm license:mint "<customer>" --expires YYYY-MM-DD');
  console.error('  LMNR_LICENSE_SIGNING_KEY=<seed> pnpm license:mint "<customer>" --perpetual');
  process.exit(1);
};

const flagValue = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};

const keygen = () => {
  const seed = crypto.randomBytes(32);
  console.log("Signing key (store in the secret manager, shown once):");
  console.log(`  LMNR_LICENSE_SIGNING_KEY=${seed.toString("base64url")}\n`);
  console.log("Public key (append to LICENSE_PUBLIC_KEYS in format.ts and PUBLIC_KEYS in key.rs):");
  console.log(`  ${publicKeyFromSeed(seed)}`);
};

const parseExpiry = (): number | null => {
  if (process.argv.includes("--perpetual")) {
    return null;
  }
  const expires = flagValue("--expires");
  if (!expires || !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    usage();
  }
  // End of the given day in UTC, so a license "until 2027-10-31" covers that day.
  const expiresAt = Math.floor(Date.parse(`${expires}T23:59:59Z`) / 1000);
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now() / 1000) {
    console.error(`--expires must be a future date, got ${expires}`);
    process.exit(1);
  }
  return expiresAt;
};

const mint = () => {
  const customer = process.argv.slice(2).find((arg, i, args) => !arg.startsWith("--") && args[i - 1] !== "--expires");
  if (!customer) {
    usage();
    return;
  }
  const encodedSeed = process.env.LMNR_LICENSE_SIGNING_KEY;
  if (!encodedSeed) {
    console.error("LMNR_LICENSE_SIGNING_KEY is not set.");
    process.exit(1);
  }
  const seed = Buffer.from(encodedSeed, "base64url");
  const expiresAt = parseExpiry();

  if (!LICENSE_PUBLIC_KEYS.includes(publicKeyFromSeed(seed))) {
    console.error(
      "LMNR_LICENSE_SIGNING_KEY does not match any of LICENSE_PUBLIC_KEYS; deployed instances would reject the key."
    );
    process.exit(1);
  }

  const payload = {
    v: 1,
    licenseId: crypto.randomUUID(),
    customer,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt,
  };
  const key = signLicense(payload, seed);
  if (!verifyLicense(key)) {
    console.error("Minted key failed verification.");
    process.exit(1);
  }

  console.log(
    `License ${payload.licenseId} for "${customer}", ${expiresAt === null ? "perpetual" : `expires ${new Date(expiresAt * 1000).toISOString()}`}.`
  );
  console.log(
    "Give the customer this line for their values.yaml secrets.data, or have them paste the key into Settings → License:\n"
  );
  console.log(`  LMNR_LICENSE_KEY: "${key}"\n`);
  console.log("Record the license ID against the contract; the key itself is not stored anywhere.");
};

if (process.argv.includes("--keygen")) {
  keygen();
} else {
  mint();
}
