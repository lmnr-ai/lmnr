import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { agents } from "@/lib/db/migrations/schema";

export async function GET(_req: Request, props: { params: Promise<{ projectId: string; agentId: string }> }) {
  const { projectId, agentId } = await props.params;

  try {
    const [agent] = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
      .limit(1);

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    return Response.json(agent);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
