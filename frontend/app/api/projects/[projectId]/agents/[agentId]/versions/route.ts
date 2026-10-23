import { ZodError } from "zod/v4";

import { mockAgentVersions } from "@/lib/actions/agents/mock";

export async function GET(req: Request, props: { params: Promise<{ projectId: string; agentId: string }> }) {
  const { projectId, agentId } = await props.params;

  try {
    const result = mockAgentVersions(agentId, new URL(req.url).searchParams);
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
