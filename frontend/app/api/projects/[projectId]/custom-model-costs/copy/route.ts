import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, ZodError } from "zod/v4";

import { copyCustomModelCosts } from "@/lib/actions/custom-model-costs";
import { authOptions } from "@/lib/auth";
import { isUserMemberOfProject } from "@/lib/authorization";

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;

  try {
    const body = await req.json();
    const targetProjectId = body.targetProjectId;

    if (!targetProjectId) {
      return new Response("targetProjectId is required", { status: 400 });
    }

    // The source project (params.projectId) is implicitly authorized via DB filtering,
    // consistent with other project routes. The target project needs an explicit check
    // because it comes from the request body and is not covered by the URL path.
    const session = await getServerSession(authOptions);
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (!(await isUserMemberOfProject(targetProjectId, session.user.id))) {
      return new Response("Forbidden: no access to target project", { status: 403 });
    }

    const result = await copyCustomModelCosts({
      sourceProjectId: params.projectId,
      targetProjectId,
    });

    if (result.length === 0) {
      return new Response("No custom model costs found in source project", { status: 400 });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error copying custom model costs:", error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}
