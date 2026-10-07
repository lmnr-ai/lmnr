import { ZodError } from "zod/v4";

import { getAgentVersions } from "@/lib/actions/agents";

export async function GET(_req: Request, props: { params: Promise<{ projectId: string; agentId: string }> }) {
  const { projectId, agentId } = await props.params;

  try {
    const result = await getAgentVersions({ projectId, agentId });
    if (!result) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
