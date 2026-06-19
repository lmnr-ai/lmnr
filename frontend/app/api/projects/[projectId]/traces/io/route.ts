import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getMainAgentIOBatch } from "@/lib/actions/sessions/trace-io";

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;
  try {
    const body = await req.json();
    const result = await getMainAgentIOBatch({ ...body, projectId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
