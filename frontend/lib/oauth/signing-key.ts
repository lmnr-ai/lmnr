import { randomUUID } from "crypto";
import { desc, eq, isNull, or, sql as drizzleSql } from "drizzle-orm";
import { exportJWK, exportPKCS8, generateKeyPair, importPKCS8, type JWK, type KeyLike } from "jose";

import { decryptValue, encryptValue } from "@/lib/crypto";
import { db } from "@/lib/db/drizzle";
import { oauthSigningKeys } from "@/lib/db/migrations/schema";

const ALG = "RS256";
const AAD = "oauth-signing-key";

export interface ActiveSigningKey {
  kid: string;
  privateKey: KeyLike;
  publicJwk: JWK;
}

// Process-local cache. The signing key is immutable per row, so once we've
// unwrapped the private PEM we don't need to hit Postgres or AES on every sign.
let cachedActive: ActiveSigningKey | null = null;

async function importActiveRow(row: typeof oauthSigningKeys.$inferSelect): Promise<ActiveSigningKey> {
  const pkcs8Pem = await decryptValue(AAD, row.privatePkcs8Nonce, row.privatePkcs8);
  const privateKey = (await importPKCS8(pkcs8Pem, row.algorithm)) as KeyLike;
  return {
    kid: row.kid,
    privateKey,
    publicJwk: row.publicJwk as JWK,
  };
}

async function generateAndPersist(): Promise<ActiveSigningKey> {
  const { publicKey, privateKey } = await generateKeyPair(ALG, { extractable: true });
  const pkcs8 = await exportPKCS8(privateKey);
  const publicJwk = await exportJWK(publicKey);
  const kid = randomUUID();
  publicJwk.kid = kid;
  publicJwk.alg = ALG;
  publicJwk.use = "sig";

  const { value, nonce } = await encryptValue(AAD, pkcs8);

  await db.insert(oauthSigningKeys).values({
    kid,
    algorithm: ALG,
    publicJwk,
    privatePkcs8: value,
    privatePkcs8Nonce: nonce,
  });

  return { kid, privateKey: privateKey as KeyLike, publicJwk };
}

/**
 * Returns the current signing key, generating one on first call. The result
 * is memoised in module scope — Next.js boots one node process per worker
 * and we never rotate during a process lifetime.
 */
export async function getOrCreateActiveSigningKey(): Promise<ActiveSigningKey> {
  if (cachedActive) return cachedActive;

  const [existing] = await db
    .select()
    .from(oauthSigningKeys)
    .where(isNull(oauthSigningKeys.rotatedAt))
    .orderBy(desc(oauthSigningKeys.createdAt))
    .limit(1);

  if (existing) {
    cachedActive = await importActiveRow(existing);
    return cachedActive;
  }

  cachedActive = await generateAndPersist();
  return cachedActive;
}

/**
 * Returns the public JWKs for every key that hasn't passed its hard expiry.
 * Old (rotated) keys stay published until their `expires_at` so previously
 * issued tokens still verify until they expire on their own.
 */
export async function getAllPublicJwks(): Promise<JWK[]> {
  const rows = await db
    .select({ publicJwk: oauthSigningKeys.publicJwk })
    .from(oauthSigningKeys)
    .where(or(isNull(oauthSigningKeys.expiresAt), drizzleSql`${oauthSigningKeys.expiresAt} > now()`));
  return rows.map((r) => r.publicJwk as JWK);
}

// Reset module-scoped cache. Tests only.
export function _resetSigningKeyCacheForTests() {
  cachedActive = null;
}

// Drizzle's $inferSelect doesn't satisfy strict types from eq() above; keep
// reference so unused-imports lint doesn't trip.
void eq;
