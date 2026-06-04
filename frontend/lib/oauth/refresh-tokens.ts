import { randomUUID } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";

import { hashApiKey } from "@/lib/api-keys";
import { db } from "@/lib/db/drizzle";
import { oauthRefreshTokens } from "@/lib/db/migrations/schema";
import { generateRefreshToken } from "@/lib/oauth/codes";

export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface MintRefreshTokenInput {
  userId: string;
  projectId: string;
  scope: string;
  clientId: string;
  familyId?: string;
}

export interface MintedRefreshToken {
  value: string;
  hash: string;
  familyId: string;
  expiresAt: string;
}

export async function mintRefreshToken(input: MintRefreshTokenInput): Promise<MintedRefreshToken> {
  const value = generateRefreshToken();
  const hash = hashApiKey(value);
  const familyId = input.familyId ?? randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
  await db.insert(oauthRefreshTokens).values({
    hash,
    familyId,
    userId: input.userId,
    projectId: input.projectId,
    scope: input.scope,
    clientId: input.clientId,
    expiresAt,
  });
  return { value, hash, familyId, expiresAt };
}

export type RefreshTokenRow = typeof oauthRefreshTokens.$inferSelect;

export async function getRefreshTokenByHash(hash: string): Promise<RefreshTokenRow | null> {
  const [row] = await db.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.hash, hash)).limit(1);
  return row ?? null;
}

/** Revokes every token in a family (issued from the same login or refresh chain). */
export async function revokeFamily(familyId: string): Promise<void> {
  await db
    .update(oauthRefreshTokens)
    .set({ revokedAt: sql`now()` })
    .where(eq(oauthRefreshTokens.familyId, familyId));
}

/**
 * Single-use rotation: marks `oldHash` rotated and inserts a new token under the
 * same family. Both ops in one transaction so reuse-detect can't double-mint.
 * Returns the new token row.
 */
export async function rotateRefreshToken(oldHash: string, next: MintRefreshTokenInput): Promise<MintedRefreshToken> {
  return await db.transaction(async (tx) => {
    const rotated = await tx
      .update(oauthRefreshTokens)
      .set({ rotatedAt: sql`now()` })
      .where(and(eq(oauthRefreshTokens.hash, oldHash), isNull(oauthRefreshTokens.rotatedAt)))
      .returning({ hash: oauthRefreshTokens.hash });

    if (rotated.length === 0) {
      throw new Error("RotationRaceLost");
    }

    const value = generateRefreshToken();
    const hash = hashApiKey(value);
    const familyId = next.familyId!;
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();

    await tx.insert(oauthRefreshTokens).values({
      hash,
      familyId,
      userId: next.userId,
      projectId: next.projectId,
      scope: next.scope,
      clientId: next.clientId,
      expiresAt,
    });

    return { value, hash, familyId, expiresAt };
  });
}
