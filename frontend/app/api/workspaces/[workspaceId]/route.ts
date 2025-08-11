import { prettifyError, ZodError } from "zod/v4";

import { getWorkspace } from "@/lib/actions/workspaces";

export async function GET(_req: Request, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const workspace = await getWorkspace({ workspaceId: params.workspaceId });

    return Response.json(workspace);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json({ error: "Failed to get workspace. Please try again." }, { status: 500 });
  }
}
