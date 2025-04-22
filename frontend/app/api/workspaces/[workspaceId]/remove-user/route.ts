import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces } from "@/lib/db/migrations/schema";

export async function DELETE(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const params = await props.params;
  const userId = req.nextUrl.searchParams.get("id");

  if (!userId) {
    return new Response("No user id was provided", { status: 400 });
  }

  await db
    .delete(membersOfWorkspaces)
    .where(and(eq(membersOfWorkspaces.workspaceId, params.workspaceId), eq(membersOfWorkspaces.userId, userId)));

  return new Response("User removed successfully.", { status: 200 });
}
