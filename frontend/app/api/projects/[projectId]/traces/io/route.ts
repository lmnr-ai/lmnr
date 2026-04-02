import { type NextRequest } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { getMainAgentIOBatch } from "@/lib/actions/sessions/trace-io";

const bodySchema = z.object({
  traceIds: z
    .array(z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/))
    .min(1)
    .max(100),
});

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;
  try {
    const body = await req.json();
    const { traceIds } = bodySchema.parse(body);
    const result = await getMainAgentIOBatch({ traceIds, projectId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
