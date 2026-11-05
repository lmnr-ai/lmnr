import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { listWorkspaceFeatureRoutes, setWorkspaceFeatureRoute } from "@/lib/actions/llm-feature-routes";
import { AppServerError } from "@/lib/app-server";
import { AuthorizationError } from "@/lib/errors";

type Params = { params: Promise<{ workspaceId: string }> };

const errorResponse = (error: unknown, fallback: string): Response => {
  if (error instanceof ZodError) {
    return Response.json({ error: prettifyError(error) }, { status: 400 });
  }
  if (error instanceof AppServerError || error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
};

export async function GET(_req: NextRequest, props: Params): Promise<Response> {
  try {
    const { workspaceId } = await props.params;
    return Response.json(await listWorkspaceFeatureRoutes({ workspaceId }));
  } catch (error) {
    return errorResponse(error, "Failed to load AI feature settings.");
  }
}

export async function PUT(req: NextRequest, props: Params): Promise<Response> {
  try {
    const { workspaceId } = await props.params;
    const body = await req.json();
    await setWorkspaceFeatureRoute({ ...body, workspaceId });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "Failed to update AI feature settings.");
  }
}
