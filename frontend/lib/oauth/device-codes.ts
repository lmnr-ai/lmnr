import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { oauthDeviceCodes } from "@/lib/db/migrations/schema";
import { generateDeviceCode, generateUserCode } from "@/lib/oauth/codes";

export const DEVICE_CODE_TTL_SECONDS = 15 * 60;
export const POLL_INTERVAL_SECONDS = 5;

export type DeviceCodeStatus = "pending" | "approved" | "denied" | "claimed" | "expired";

export interface DeviceCodeRow {
  deviceCode: string;
  userCode: string;
  clientId: string;
  scope: string;
  status: DeviceCodeStatus;
  approvedUserId: string | null;
  approvedProjectId: string | null;
  requestedProjectId: string | null;
  lastPolledAt: string | null;
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
}

export interface CreateDeviceCodeInput {
  clientId: string;
  scope: string;
  requestedProjectId?: string | null;
}

/**
 * Inserts a fresh device-code row. Retries up to 5 times on user_code collisions
 * (statistically improbable but worth handling).
 */
export async function createDeviceCode(input: CreateDeviceCodeInput): Promise<DeviceCodeRow> {
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();
    try {
      const [row] = await db
        .insert(oauthDeviceCodes)
        .values({
          deviceCode,
          userCode,
          clientId: input.clientId,
          scope: input.scope,
          status: "pending",
          requestedProjectId: input.requestedProjectId ?? null,
          expiresAt,
        })
        .returning();
      return row as DeviceCodeRow;
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }
  throw new Error("Unable to allocate device code");
}

export async function getDeviceCodeByUserCode(userCode: string): Promise<DeviceCodeRow | null> {
  const [row] = await db.select().from(oauthDeviceCodes).where(eq(oauthDeviceCodes.userCode, userCode)).limit(1);
  return (row as DeviceCodeRow | undefined) ?? null;
}

export async function getDeviceCode(deviceCode: string): Promise<DeviceCodeRow | null> {
  const [row] = await db.select().from(oauthDeviceCodes).where(eq(oauthDeviceCodes.deviceCode, deviceCode)).limit(1);
  return (row as DeviceCodeRow | undefined) ?? null;
}

/** Bumps last_polled_at to now. Returns the previous value (or null if first poll). */
export async function recordPoll(deviceCode: string): Promise<string | null> {
  const [row] = await db
    .update(oauthDeviceCodes)
    .set({ lastPolledAt: sql`now()` })
    .where(eq(oauthDeviceCodes.deviceCode, deviceCode))
    .returning({ lastPolledAt: oauthDeviceCodes.lastPolledAt });
  return row?.lastPolledAt ?? null;
}

export async function approveDeviceCode(
  userCode: string,
  approvedUserId: string,
  approvedProjectId: string
): Promise<boolean> {
  const result = await db
    .update(oauthDeviceCodes)
    .set({
      status: "approved",
      approvedUserId,
      approvedProjectId,
      approvedAt: sql`now()`,
    })
    .where(and(eq(oauthDeviceCodes.userCode, userCode), eq(oauthDeviceCodes.status, "pending")))
    .returning({ deviceCode: oauthDeviceCodes.deviceCode });
  return result.length > 0;
}

export async function denyDeviceCode(userCode: string): Promise<boolean> {
  const result = await db
    .update(oauthDeviceCodes)
    .set({ status: "denied" })
    .where(and(eq(oauthDeviceCodes.userCode, userCode), eq(oauthDeviceCodes.status, "pending")))
    .returning({ deviceCode: oauthDeviceCodes.deviceCode });
  return result.length > 0;
}

/**
 * Atomically flips approved → claimed and returns the user/project ids. Returns
 * null if the row is no longer in approved state (someone else claimed first, or
 * it expired / was denied).
 */
export async function claimDeviceCode(deviceCode: string): Promise<{ userId: string; projectId: string } | null> {
  const [row] = await db
    .update(oauthDeviceCodes)
    .set({ status: "claimed" })
    .where(and(eq(oauthDeviceCodes.deviceCode, deviceCode), eq(oauthDeviceCodes.status, "approved")))
    .returning({
      userId: oauthDeviceCodes.approvedUserId,
      projectId: oauthDeviceCodes.approvedProjectId,
    });
  if (!row || !row.userId || !row.projectId) return null;
  return { userId: row.userId, projectId: row.projectId };
}
