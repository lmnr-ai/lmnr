import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, ZodError } from "zod/v4";

import { deleteWorkspace, updateWorkspace, UpdateWorkspaceSchema } from "@/lib/actions/workspaces";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { apiKeys, membersOfWorkspaces, subscriptionTiers, users, workspaces } from "@/lib/db/migrations/schema";

export async function GET(req: Request, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Get workspace with users
    const workspace = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        tierName: subscriptionTiers.name,
      })
      .from(workspaces)
      .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
      .where(eq(workspaces.id, params.workspaceId))
      .limit(1);

    if (!workspace[0]) {
      return new Response("Workspace not found", { status: 404 });
    }

    // Get workspace users
    const workspaceUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: membersOfWorkspaces.memberRole,
        createdAt: membersOfWorkspaces.createdAt,
      })
      .from(users)
      .innerJoin(membersOfWorkspaces, eq(users.id, membersOfWorkspaces.userId))
      .where(eq(membersOfWorkspaces.workspaceId, params.workspaceId));

    const result = {
      ...workspace[0],
      users: workspaceUsers,
    };

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching workspace:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const params = await props.params;
  const { workspaceId } = params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json("Unauthorized", { status: 401 });
  }

  try {
    // Check if user is owner of workspace
    const userApiKey = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.apiKey, session.user.apiKey),
    });

    if (!userApiKey) {
      return Response.json("User not found", { status: 401 });
    }

    const membership = await db.query.membersOfWorkspaces.findFirst({
      where: and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, userApiKey.userId)),
    });

    if (!membership || membership.memberRole !== "owner") {
      return Response.json("Forbidden: Only workspace owners can rename workspaces", { status: 403 });
    }

    const { name } = await req.json();
    const result = UpdateWorkspaceSchema.safeParse({ name, workspaceId });

    if (!result.success) {
      return Response.json("Invalid request body", { status: 400 });
    }

    await updateWorkspace({ workspaceId, name });

    return Response.json({ message: "Workspace renamed successfully." });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update workspace." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const params = await props.params;
  const { workspaceId } = params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json("Unauthorized", { status: 401 });
  }

  try {
    const userApiKey = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.apiKey, session.user.apiKey),
    });

    if (!userApiKey) {
      return Response.json("User not found", { status: 401 });
    }

    const membership = await db.query.membersOfWorkspaces.findFirst({
      where: and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, userApiKey.userId)),
    });

    if (!membership || membership.memberRole !== "owner") {
      return Response.json("Forbidden: Only workspace owners can delete workspaces", { status: 403 });
    }

    await deleteWorkspace({ workspaceId });

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete workspace. Please try again." },
      { status: 500 }
    );
  }
}
