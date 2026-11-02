import { prettifyError, ZodError } from "zod/v4";

import { renameAgent } from "@/lib/actions/agents";

export async function PATCH(req: Request, props: { params: Promise<{ projectId: string; agentId: string }> }) {
  const { projectId, agentId } = await props.params;

  try {
    const body = await req.json();
    const agent = await renameAgent({ projectId, agentId, name: body?.name });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    return Response.json(agent);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
