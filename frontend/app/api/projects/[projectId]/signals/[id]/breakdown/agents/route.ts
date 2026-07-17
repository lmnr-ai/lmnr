import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getAgentBuckets } from "@/lib/actions/signal-breakdown";

// Agent → version tree (Postgres) for the "Agent" breakdown dimension's bucket
// list. Range counts come separately from /breakdown/stats?dimension=agent.
export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const { projectId } = await props.params;

  try {
    const result = await getAgentBuckets({ projectId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch agent buckets." },
      { status: 500 }
    );
  }
}
