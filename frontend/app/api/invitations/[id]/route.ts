import { and, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, workspaceInvitations } from "@/lib/db/migrations/schema";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { workspaceId, action, email } = (await req.json()) as {
    workspaceId: string;
    action: "accept" | "decline";
    email: string;
  };

  if (!workspaceId) {
    return new Response("Workspace ID is required", { status: 400 });
  }

  const invitation = await db.query.workspaceInvitations.findFirst({
    where: and(eq(workspaceInvitations.id, id), eq(workspaceInvitations.email, email)),
  });

  if (!invitation) {
    return new Response("Invitation not found.", { status: 404 });
  }

  if (action === "accept") {
    await db.transaction(async (tx) => {
      await tx
        .delete(workspaceInvitations)
        .where(and(eq(workspaceInvitations.id, id), eq(workspaceInvitations.workspaceId, workspaceId)));

      await tx.insert(membersOfWorkspaces).values({ userId: user.id, memberRole: "member", workspaceId });
    });
    return new Response("Invitation accepted.", { status: 200 });
  }

  if (action === "decline") {
    await db
      .delete(workspaceInvitations)
      .where(and(eq(workspaceInvitations.id, id), eq(workspaceInvitations.workspaceId, workspaceId)));

    return new Response("Invitation declined", { status: 200 });
  }

  return new Response("Invalid action", { status: 400 });
}
