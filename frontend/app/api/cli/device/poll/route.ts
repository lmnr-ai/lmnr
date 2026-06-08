import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod/v4";

import { extractProjectIdFromScope } from "@/lib/actions/device";
import { createApiKey } from "@/lib/actions/project-api-keys";
import { isUserMemberOfProject } from "@/lib/authorization";
import { db } from "@/lib/db/drizzle";
import { deviceCodes, projects, users, workspaces } from "@/lib/db/migrations/schema";

const Body = z.object({
  grant_type: z.literal("urn:ietf:params:oauth:grant-type:device_code"),
  device_code: z.string().min(1),
  client_id: z.string().min(1),
  device_name: z.string().max(120).optional(),
});

// Wire-compatible with the RFC 8628 token endpoint: the CLI polls this instead
// of /api/auth/device/token. Returns a Laminar project API key directly (no
// intermediate session token) once the user has approved + picked a project.
// We own this endpoint because BetterAuth's /device/token endpoint deletes the
// device_code row on success — we need it to look up the picked project before
// minting, which is incompatible with the "delete then return" sequence.
export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json());
    if (body.client_id !== "lmnr-cli") {
      return NextResponse.json({ error: "invalid_client", error_description: "Unknown client" }, { status: 400 });
    }

    const [row] = await db
      .select({
        id: deviceCodes.id,
        userId: deviceCodes.userId,
        status: deviceCodes.status,
        clientId: deviceCodes.clientId,
        expiresAt: deviceCodes.expiresAt,
        lastPolledAt: deviceCodes.lastPolledAt,
        pollingInterval: deviceCodes.pollingInterval,
      })
      .from(deviceCodes)
      .where(eq(deviceCodes.deviceCode, body.device_code))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "invalid_grant", error_description: "Invalid device code" }, { status: 400 });
    }
    if (row.clientId && row.clientId !== body.client_id) {
      return NextResponse.json({ error: "invalid_grant", error_description: "Client ID mismatch" }, { status: 400 });
    }
    if (row.lastPolledAt && row.pollingInterval) {
      const elapsedMs = Date.now() - new Date(row.lastPolledAt).getTime();
      if (elapsedMs < row.pollingInterval) {
        await db.update(deviceCodes).set({ lastPolledAt: new Date() }).where(eq(deviceCodes.id, row.id));
        return NextResponse.json({ error: "slow_down", error_description: "Polling too frequently" }, { status: 400 });
      }
    }
    await db.update(deviceCodes).set({ lastPolledAt: new Date() }).where(eq(deviceCodes.id, row.id));

    if (row.expiresAt.getTime() < Date.now()) {
      await db.delete(deviceCodes).where(eq(deviceCodes.id, row.id));
      return NextResponse.json({ error: "expired_token", error_description: "Device code expired" }, { status: 400 });
    }
    if (row.status === "pending") {
      return NextResponse.json(
        { error: "authorization_pending", error_description: "Authorization pending" },
        { status: 400 }
      );
    }
    if (row.status === "denied") {
      await db.delete(deviceCodes).where(eq(deviceCodes.id, row.id));
      return NextResponse.json({ error: "access_denied", error_description: "Access denied" }, { status: 400 });
    }
    if (row.status !== "approved" || !row.userId) {
      return NextResponse.json(
        { error: "invalid_grant", error_description: "Device code in unexpected state" },
        { status: 400 }
      );
    }

    // Claim-then-mint: delete the device_code row FIRST and use the deleted
    // row's scope/userId for everything downstream. Only one concurrent poll
    // can win the single-PK delete, so the mint that follows can run at most
    // once per device_code — closing the double-mint window. A delete failure
    // aborts before any mint; a mint failure after the delete just makes the
    // CLI re-run `login` (no orphan key, since the row is already gone).
    const [claimed] = await db.delete(deviceCodes).where(eq(deviceCodes.id, row.id)).returning({
      userId: deviceCodes.userId,
      scope: deviceCodes.scope,
    });
    if (!claimed || !claimed.userId) {
      // Lost the race (another poll already consumed it) or row vanished.
      return NextResponse.json(
        { error: "invalid_grant", error_description: "Device code already consumed" },
        { status: 400 }
      );
    }

    const projectId = extractProjectIdFromScope(claimed.scope);
    if (!projectId) {
      return NextResponse.json(
        { error: "invalid_grant", error_description: "Approved device code is missing a project selection" },
        { status: 400 }
      );
    }

    const isMember = await isUserMemberOfProject(projectId, claimed.userId);
    if (!isMember) {
      return NextResponse.json(
        { error: "access_denied", error_description: "User is no longer a member of the selected project" },
        { status: 403 }
      );
    }

    const [projectRow] = await db
      .select({
        id: projects.id,
        name: projects.name,
        workspaceId: projects.workspaceId,
        workspaceName: workspaces.name,
      })
      .from(projects)
      .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projectRow) {
      return NextResponse.json(
        { error: "invalid_grant", error_description: "Selected project no longer exists" },
        { status: 400 }
      );
    }

    const [userRow] = await db
      .select({ email: users.email, id: users.id })
      .from(users)
      .where(eq(users.id, claimed.userId))
      .limit(1);

    const keyName = `lmnr-cli login (${body.device_name?.trim() || "unnamed device"})`.slice(0, 200);
    const key = await createApiKey({
      projectId: projectRow.id,
      name: keyName,
      isIngestOnly: false,
    });

    return NextResponse.json({
      apiKey: key.value,
      apiKeyId: key.id,
      apiKeyName: key.name,
      projectId: projectRow.id,
      projectName: projectRow.name,
      workspaceId: projectRow.workspaceId,
      workspaceName: projectRow.workspaceName,
      userId: userRow?.id ?? claimed.userId,
      userEmail: userRow?.email ?? null,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "invalid_request", error_description: error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "server_error", error_description: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
