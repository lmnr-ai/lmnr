import { type NextRequest } from "next/server";

import { isEvaluationPublic } from "@/lib/actions/evaluation/visibility";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluationId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { evaluationId } = params;

  try {
    const isPublic = await isEvaluationPublic(evaluationId);
    return Response.json({ visibility: isPublic ? "public" : "private" });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch evaluation visibility." },
      { status: 500 }
    );
  }
}
