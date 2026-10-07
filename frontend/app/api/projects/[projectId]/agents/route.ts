import { ZodError } from "zod/v4";

import { getAgents } from "@/lib/actions/agents";

export async function GET(_req: Request, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;

  try {
    const agents = await getAgents({ projectId });
    return Response.json(agents);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
