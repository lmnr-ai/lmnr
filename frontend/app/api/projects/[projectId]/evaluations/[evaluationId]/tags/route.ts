import { prettifyError, ZodError } from "zod/v4";

import { addEvaluationTag, getEvaluationTags } from "@/lib/actions/evaluation/tags";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; evaluationId: string }> }
): Promise<Response> {
  try {
    const { projectId, evaluationId } = await props.params;
    const tags = await getEvaluationTags({ projectId, evaluationId });
    return Response.json(tags);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: "Failed to get evaluation tags" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; evaluationId: string }> }
): Promise<Response> {
  try {
    const { projectId, evaluationId } = await props.params;
    const { tagName } = (await req.json()) as { tagName?: string };

    const tags = await addEvaluationTag({ projectId, evaluationId, name: tagName ?? "" });
    return Response.json(tags);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: "Failed to add evaluation tag" }, { status: 500 });
  }
}
