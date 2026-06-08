import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { deviceCodes, membersOfWorkspaces, projects, workspaces } from "@/lib/db/migrations/schema";

export interface DeviceProject {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
}

export interface DeviceApprovalContext {
  userCode: string;
  status: "pending" | "approved" | "denied";
  clientId: string | null;
  scope: string | null;
  expiresAt: string;
  // null after the GET /api/auth/device claim returns; the user must hit that
  // endpoint before approve will succeed.
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

export const listUserProjects = async (userId: string): Promise<DeviceProject[]> => {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      workspaceId: projects.workspaceId,
      workspaceName: workspaces.name,
    })
    .from(projects)
    .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .innerJoin(membersOfWorkspaces, eq(membersOfWorkspaces.workspaceId, workspaces.id))
    .where(eq(membersOfWorkspaces.userId, userId))
    .orderBy(asc(workspaces.name), asc(projects.name));
  return rows;
};

// Persist the picked project on the deviceCodes row by appending `project:<id>`
// to scope. The exchange endpoint parses this back out and mints a project-scoped
// API key. Guarded by user_id to prevent cross-user takeover.
export const setDeviceProjectSelection = async (input: {
  userCode: string;
  projectId: string;
  userId: string;
  baseScope: string | null;
}): Promise<boolean> => {
  const userCode = normalizeUserCode(input.userCode);
  const cleanedBase = (input.baseScope ?? "")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !t.startsWith("project:"))
    .join(" ");
  const newScope = cleanedBase.length > 0 ? `${cleanedBase} project:${input.projectId}` : `project:${input.projectId}`;
  const result = await db
    .update(deviceCodes)
    .set({ scope: newScope, updatedAt: new Date() })
    .where(
      and(eq(deviceCodes.userCode, userCode), eq(deviceCodes.userId, input.userId), eq(deviceCodes.status, "pending"))
    )
    .returning({ id: deviceCodes.id });
  return result.length > 0;
};

export const extractProjectIdFromScope = (scope: string | null | undefined): string | null => {
  if (!scope) return null;
  for (const token of scope.split(/\s+/)) {
    if (token.startsWith("project:")) {
      const id = token.slice("project:".length);
      if (id.length > 0) return id;
    }
  }
  return null;
};
