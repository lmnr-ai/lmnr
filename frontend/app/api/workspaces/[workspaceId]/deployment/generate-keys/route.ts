import { prettifyError, ZodError } from "zod/v4";

import { generateDeploymentKeys } from "@/lib/actions/workspace/deployment.ts";

export async function POST(_req: Request, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;

    const result = await generateDeploymentKeys({
      workspaceId: params.workspaceId,
    });

    return Response.json({ publicKey: result.publicKey });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate deployment keys." },
      { status: 500 }
    );
  }
}
