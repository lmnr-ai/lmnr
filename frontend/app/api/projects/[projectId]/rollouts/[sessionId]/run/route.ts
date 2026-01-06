import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { fetcherJSON } from "@/lib/utils";

export async function POST(req: Request, props: { params: Promise<{ projectId: string; sessionId: string }> }) {
  try {
    const params = await props.params;
    const { sessionId, projectId } = params;
    const body = await req.json();

    const result = await fetcherJSON(`/projects/${projectId}/rollouts/${sessionId}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        trace_id: body.trace_id,
        path_to_count: body.path_to_count,
        args: body.args || {},
        overrides: body.overrides || {},
      }),
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    console.error("Rollout run error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to run rollout session.",
      },
      { status: 500 }
    );
  }
}
