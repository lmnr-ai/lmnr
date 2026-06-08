import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { deviceCodes } from "@/lib/db/migrations/schema";

export interface DeviceApprovalContext {
  userCode: string;
  status: "pending" | "approved" | "denied";
  clientId: string | null;
  scope: string | null;
  expiresAt: string;
  userId: string | null;
}

// Strip dashes — BetterAuth stores user codes without separators.
const normalizeUserCode = (raw: string): string => raw.replace(/-/g, "").toUpperCase();

export const loadDeviceContext = async (rawUserCode: string): Promise<DeviceApprovalContext | null> => {
  const userCode = normalizeUserCode(rawUserCode);
  if (userCode.length === 0) return null;
  const [row] = await db
    .select({
      userCode: deviceCodes.userCode,
      status: deviceCodes.status,
      clientId: deviceCodes.clientId,
      scope: deviceCodes.scope,
      expiresAt: deviceCodes.expiresAt,
      userId: deviceCodes.userId,
    })
    .from(deviceCodes)
    .where(eq(deviceCodes.userCode, userCode))
    .limit(1);
  if (!row) return null;
  return {
    userCode: row.userCode,
    status: row.status as DeviceApprovalContext["status"],
    clientId: row.clientId,
    scope: row.scope,
    expiresAt: row.expiresAt.toISOString(),
    userId: row.userId,
  };
};

// Claim the user code for the current session. BetterAuth's GET /api/auth/device
// does this server-side; we call it via the SDK so the session cookie / Origin
// rules are handled identically to the browser flow.
export const claimUserCodeForCurrentSession = async (rawUserCode: string): Promise<void> => {
  const userCode = normalizeUserCode(rawUserCode);
  if (userCode.length === 0) return;
  try {
    await auth.api.deviceVerify({ query: { user_code: userCode }, headers: await headers() });
  } catch {
    // Claim is best-effort — invalid / expired codes surface as banner errors
    // via loadDeviceContext.
  }
};
