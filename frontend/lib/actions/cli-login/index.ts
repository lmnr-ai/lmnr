import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod/v4";

import { cacheProjectApiKey, createApiKey } from "@/lib/actions/project-api-keys";
import { db } from "@/lib/db/drizzle";
import { cliLoginGrants, membersOfWorkspaces, projects, users, workspaces } from "@/lib/db/migrations/schema";

import { encryptPayload, isValidPublicKey } from "./crypto";

// Grant TTL — 10 minutes is comfortably more than a human browser round trip.
const GRANT_TTL_MS = 10 * 60 * 1000;

const ClientInfoSchema = z
  .object({
    hostname: z.string().max(256).optional(),
    platform: z.string().max(64).optional(),
    cliVersion: z.string().max(64).optional(),
  })
  .strict();

const CreateGrantSchema = z.object({
  publicKey: z.string().min(1).max(256),
  clientInfo: ClientInfoSchema.optional(),
});

export type ClientInfo = z.infer<typeof ClientInfoSchema>;

export interface CreateGrantResult {
  sessionId: string;
  expiresAt: string;
}

export const createGrant = async (input: z.infer<typeof CreateGrantSchema>): Promise<CreateGrantResult> => {
  const { publicKey, clientInfo } = CreateGrantSchema.parse(input);
  if (!isValidPublicKey(publicKey)) {
    const err = new Error("publicKey must be 32 bytes encoded as base64url");
    (err as { status?: number }).status = 400;
    throw err;
  }
  const sessionId = uuidv4();
  const now = Date.now();
  const expiresAt = new Date(now + GRANT_TTL_MS).toISOString();

  await db.insert(cliLoginGrants).values({
    sessionId,
    publicKey,
    clientInfo: clientInfo ?? {},
    status: "pending",
    expiresAt,
  });

  return { sessionId, expiresAt };
};

export type GrantStatus = "pending" | "approved" | "expired" | "already_claimed";

export interface GetGrantResult {
  status: GrantStatus;
  encrypted?: string;
  nonce?: string;
  ephemeralPublicKey?: string;
}

// Read-only grant status check. Unlike `getGrant`, this does NOT flip an
// approved-but-unclaimed grant to claimed — used by the /cli-login page to
// pre-validate the session_id before rendering the picker. Returns the
// lifecycle state without exposing the ciphertext.
export const peekGrantStatus = async (input: { sessionId: string }): Promise<{ status: GrantStatus } | null> => {
  const sessionId = String(input.sessionId);
  const rows = await db
    .select({ status: cliLoginGrants.status, expiresAt: cliLoginGrants.expiresAt, claimedAt: cliLoginGrants.claimedAt })
    .from(cliLoginGrants)
    .where(eq(cliLoginGrants.sessionId, sessionId))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];

  if (new Date(row.expiresAt).getTime() < Date.now() && row.status !== "approved") {
    return { status: "expired" };
  }
  if (row.status === "pending") return { status: "pending" };
  if (row.status === "approved") {
    return { status: row.claimedAt ? "already_claimed" : "approved" };
  }
  return { status: "expired" };
};

export const getGrant = async (input: { sessionId: string }): Promise<GetGrantResult | null> => {
  const sessionId = String(input.sessionId);
  const rows = await db.select().from(cliLoginGrants).where(eq(cliLoginGrants.sessionId, sessionId)).limit(1);
  if (rows.length === 0) return null;
  const grant = rows[0];

  // Lazy expiry — sweep job is optional, callers see "expired" rather than stale state.
  if (new Date(grant.expiresAt).getTime() < Date.now() && grant.status !== "approved") {
    return { status: "expired" };
  }

  if (grant.status === "pending") {
    return { status: "pending" };
  }

  if (grant.status === "approved") {
    // One-shot claim — atomic UPDATE...WHERE claimed_at IS NULL serializes
    // concurrent polls so only the first read returns the ciphertext.
    const claimed = await db
      .update(cliLoginGrants)
      .set({ claimedAt: new Date().toISOString() })
      .where(and(eq(cliLoginGrants.sessionId, sessionId), isNull(cliLoginGrants.claimedAt)))
      .returning({ sessionId: cliLoginGrants.sessionId });

    if (claimed.length === 0) {
      return { status: "already_claimed" };
    }
    return {
      status: "approved",
      encrypted: grant.encryptedPayload ?? undefined,
      nonce: grant.encryptedNonce ?? undefined,
      ephemeralPublicKey: grant.ephemeralPublicKey ?? undefined,
    };
  }

  // Unknown status — treat as expired so the CLI bails rather than loops.
  return { status: "expired" };
};

export interface ApproveGrantResult {
  ok: true;
  projectName: string;
  workspaceName: string;
  shorthand: string;
}

const ApproveGrantSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.guid(),
  userId: z.guid(),
  userEmail: z.string().email(),
});

export const approveGrant = async (input: z.infer<typeof ApproveGrantSchema>): Promise<ApproveGrantResult> => {
  const { sessionId, projectId, userId, userEmail } = ApproveGrantSchema.parse(input);

  // Pre-check the grant outside the transaction so common-case rejects (typo'd
  // session_id, expired, already-approved) fail fast WITHOUT minting an api
  // key. The transaction below re-checks with a `WHERE status='pending'` guard
  // on the UPDATE so the race-window winner is the only caller that lands.
  const grants = await db.select().from(cliLoginGrants).where(eq(cliLoginGrants.sessionId, sessionId)).limit(1);
  if (grants.length === 0) {
    const err = new Error("Grant not found");
    (err as any).status = 404;
    throw err;
  }
  const grant = grants[0];
  if (new Date(grant.expiresAt).getTime() < Date.now()) {
    const err = new Error("Grant expired");
    (err as any).status = 410;
    throw err;
  }
  if (grant.status !== "pending") {
    const err = new Error("Grant is not pending");
    (err as any).status = 409;
    throw err;
  }

  // Resolve project + workspace name. Membership is already enforced by the
  // surrounding /api/projects/<id>/... route via proxy.ts, but join the
  // workspace name + double-check via membersOfWorkspaces so a misrouted call
  // can't mint a key without the user being on the workspace.
  const rows = await db
    .select({
      projectId: projects.id,
      projectName: projects.name,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
    })
    .from(projects)
    .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .innerJoin(membersOfWorkspaces, eq(membersOfWorkspaces.workspaceId, workspaces.id))
    .where(and(eq(projects.id, projectId), eq(membersOfWorkspaces.userId, userId)))
    .limit(1);
  if (rows.length === 0) {
    const err = new Error("Project not found or no access");
    (err as any).status = 403;
    throw err;
  }
  const { projectName, workspaceId, workspaceName } = rows[0];

  // Single transaction: mint api key, then UPDATE the grant row gated on
  // status='pending'. If the UPDATE affects 0 rows (concurrent approve already
  // won the race), throw 409 — the transaction rolls back the api-key insert
  // so no orphan key is left behind. The api-key insert lives INSIDE the
  // transaction so a post-mint DB hiccup also rolls back the key.
  const hostnameSuffix = (grant.clientInfo as ClientInfo | null | undefined)?.hostname ?? "unknown-host";
  const today = new Date().toISOString().slice(0, 10);

  const result = await db.transaction(async (tx) => {
    const apiKey = await createApiKey(
      {
        projectId,
        name: `CLI - ${hostnameSuffix} - ${today}`,
        isIngestOnly: false,
      },
      tx
    );

    const payload = JSON.stringify({
      projectApiKey: apiKey.value,
      projectId,
      projectName,
      workspaceId,
      workspaceName,
      userEmail,
      createdAt: new Date().toISOString(),
    });

    const { encryptedPayload, encryptedNonce, ephemeralPublicKey } = encryptPayload(payload, grant.publicKey);

    const updated = await tx
      .update(cliLoginGrants)
      .set({
        status: "approved",
        approvedUserId: userId,
        approvedProjectId: projectId,
        approvedWorkspaceId: workspaceId,
        encryptedPayload,
        encryptedNonce,
        ephemeralPublicKey,
        approvedAt: new Date().toISOString(),
      })
      .where(and(eq(cliLoginGrants.sessionId, sessionId), eq(cliLoginGrants.status, "pending")))
      .returning({ sessionId: cliLoginGrants.sessionId });

    if (updated.length === 0) {
      const err = new Error("Grant is not pending");
      (err as any).status = 409;
      throw err;
    }

    return { shorthand: apiKey.shorthand, hash: apiKey.hash };
  });

  // Cache the freshly-minted api key now that the tx has committed. Outside
  // the tx body so a rollback can't leave a phantom cache entry — see
  // `createApiKey` for the matching skip-when-tx branch.
  await cacheProjectApiKey({
    projectId,
    name: `CLI - ${hostnameSuffix} - ${today}`,
    hash: result.hash,
    shorthand: result.shorthand,
    isIngestOnly: false,
  });

  return { ok: true, projectName, workspaceName, shorthand: result.shorthand };
};

export interface UserContextResult {
  user: { id: string; email: string; name: string };
  workspaces: Array<{
    id: string;
    name: string;
    projects: Array<{ id: string; name: string }>;
  }>;
}

export const getUserContext = async (input: { userId: string }): Promise<UserContextResult> => {
  const userId = String(input.userId);

  const userRows = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (userRows.length === 0) {
    throw new Error("User not found");
  }

  const rows = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(membersOfWorkspaces)
    .innerJoin(workspaces, eq(membersOfWorkspaces.workspaceId, workspaces.id))
    .leftJoin(projects, eq(projects.workspaceId, workspaces.id))
    .where(eq(membersOfWorkspaces.userId, userId))
    .orderBy(asc(workspaces.name), asc(projects.name));

  const workspaceMap = new Map<string, UserContextResult["workspaces"][number]>();
  for (const row of rows) {
    let ws = workspaceMap.get(row.workspaceId);
    if (!ws) {
      ws = { id: row.workspaceId, name: row.workspaceName, projects: [] };
      workspaceMap.set(row.workspaceId, ws);
    }
    if (row.projectId && row.projectName) {
      ws.projects.push({ id: row.projectId, name: row.projectName });
    }
  }

  return {
    user: userRows[0],
    workspaces: Array.from(workspaceMap.values()),
  };
};

// Lightweight async cleanup of expired grants. Keep it cheap — single DELETE
// with the indexed expires_at predicate. Safe to call from anywhere; we use
// it lazily from the create route.
export const sweepExpiredGrants = async (): Promise<void> => {
  try {
    await db.delete(cliLoginGrants).where(sql`${cliLoginGrants.expiresAt} < now() - interval '1 day'`);
  } catch {
    // Best-effort; lazy expiry in getGrant covers correctness.
  }
};
