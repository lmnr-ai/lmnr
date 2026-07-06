import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { resolveLabelField } from "@/lib/actions/evaluation/label-field";

export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluationId: string }> }
): Promise<Response> {
  const { projectId, evaluationId } = await props.params;

  try {
    const result = await resolveLabelField({ projectId, evaluationId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to resolve the label field." },
      { status: 500 }
    );
  }
}
