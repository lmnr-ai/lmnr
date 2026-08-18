import { prettifyError, ZodError } from "zod/v4";

import { removeEvaluationTag } from "@/lib/actions/evaluation/tags";

export async function DELETE(
  _req: Request,
  props: { params: Promise<{ projectId: string; evaluationId: string; tagName: string }> }
): Promise<Response> {
  try {
    const { projectId, evaluationId, tagName } = await props.params;
    const tags = await removeEvaluationTag({ projectId, evaluationId, name: decodeURIComponent(tagName) });
    return Response.json(tags);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: "Failed to delete evaluation tag" }, { status: 500 });
  }
}
