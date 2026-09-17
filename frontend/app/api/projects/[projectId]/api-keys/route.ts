import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getProjectWorkspaceId } from "@/lib/actions/project";
import { createApiKey, deleteApiKey, getApiKeys } from "@/lib/actions/project-api-keys";
import { getProjectSettings } from "@/lib/actions/project/settings";
import { getServerSession } from "@/lib/auth-session";
import { getWorkspaceRole } from "@/lib/authorization";

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;

  try {
    const body = await req.json();
    const session = await getServerSession();

    // A project API key reads raw text (public SQL/MCP routes are
    // unrestricted), so in a `dual` PII project only the roles that may see
    // raw text can mint one. The proxy already guarantees membership.
    const settings = await getProjectSettings(params.projectId);
    if (settings?.piiMode === "dual") {
      const workspaceId = await getProjectWorkspaceId(params.projectId);
      const role = workspaceId && session?.user.id ? await getWorkspaceRole(workspaceId, session.user.id) : null;
      if (role !== "owner" && role !== "admin") {
        return Response.json(
          { error: "Only workspace owners and admins can create API keys for a project in dual PII mode" },
          { status: 403 }
        );
      }
    }

    // expiresDays: positive integer days, or null/undefined for "never".
    const expiresDays = typeof body.expiresDays === "number" ? body.expiresDays : null;
    const expiresAt =
      expiresDays && expiresDays > 0 ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString() : null;

    const result = await createApiKey({
      projectId: params.projectId,
      name: body.name,
      isIngestOnly: body.isIngestOnly,
      userId: session?.user.id ?? null,
      expiresAt,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating project API key:", error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;

  try {
    const apiKeys = await getApiKeys({
      projectId: params.projectId,
    });

    return new Response(JSON.stringify(apiKeys), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching project API keys:", error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;

  try {
    const body = await req.json();

    await deleteApiKey({
      projectId: params.projectId,
      id: body.id,
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Error deleting project API key:", error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}
