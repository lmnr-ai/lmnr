import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSpanCountsByTraceId } from "@/lib/actions/traces/span-count";

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;
  try {
    const body = await req.json();
    const result = await getSpanCountsByTraceId({ ...body, projectId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
