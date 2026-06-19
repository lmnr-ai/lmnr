import { and, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { db } from "@/lib/db/drizzle";
import { workspaceInvitations } from "@/lib/db/migrations/schema";

// Revoke a pending invitation. Accept lives on the /invitations page (email-gated);
// this route is revoke-only and authorized as an admin action — possessing an
// invitation id is NOT consent to act on it.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { workspaceId } = (await req.json()) as { workspaceId: string };

  if (!workspaceId) {
    return new Response("Workspace ID is required", { status: 400 });
  }

  try {
    await checkUserWorkspaceRole({ workspaceId, roles: ["admin", "owner"] });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  await db
    .delete(workspaceInvitations)
    .where(and(eq(workspaceInvitations.id, id), eq(workspaceInvitations.workspaceId, workspaceId)));

  return new Response("Invitation revoked", { status: 200 });
}
