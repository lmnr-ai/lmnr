import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { executeSignal } from "@/lib/actions/signals/execute";
import { checkSignalRunsLimit } from "@/lib/actions/usage/limits";

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  try {
    const body = await req.json();

    // Test runs spend real LLM tokens, so they are gated like backfill jobs.
    await checkSignalRunsLimit(projectId);

    const result = await executeSignal({ ...body, projectId });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
