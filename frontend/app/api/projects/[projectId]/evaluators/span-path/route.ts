import { type NextRequest } from "next/server";
import { z } from "zod/v4";

import { getEvaluatorsBySpanPath } from "@/lib/actions/evaluators/span-path";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const { projectId } = await props.params;
    const spanPath = req.nextUrl.searchParams.get("spanPath");

    if (!spanPath) {
      return Response.json({ error: "Span path is required. " }, { status: 400 });
    }

    const spanPathResult = JSON.parse(spanPath);

    const result = await getEvaluatorsBySpanPath({
      projectId,
      spanPath: spanPathResult,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }

    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
