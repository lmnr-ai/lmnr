import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSignalRunEstimate, GetSignalRunEstimateSchema, NotEnoughDataError } from "@/lib/actions/signals/estimate";

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  try {
    const body = await req.json();
    const parsed = GetSignalRunEstimateSchema.parse({ ...body, projectId });
    const result = await getSignalRunEstimate(parsed);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof NotEnoughDataError) {
      return Response.json(
        {
          error: error.message,
          code: "NOT_ENOUGH_DATA",
          window: error.window,
          oldestTraceAt: error.oldestTraceAt,
        },
        { status: 422 }
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to estimate signal runs." },
      { status: 500 }
    );
  }
}
