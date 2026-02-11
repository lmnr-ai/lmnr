import { prettifyError, ZodError } from "zod/v4";

import { verifyDeployment } from "@/lib/actions/workspace/deployment.ts";

export async function POST(req: Request, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const body = await req.json();

    const result = await verifyDeployment({
      workspaceId: params.workspaceId,
      dataPlaneUrl: body.dataPlaneUrl,
    });

    return Response.json({ success: result });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to verify deployment" },
      { status: 500 }
    );
  }
}
