import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getEvaluationScore, updateEvaluationScore } from "@/lib/actions/evaluation-score";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluationResultId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { evaluationResultId, projectId } = params;

  try {
    const name = req.nextUrl.searchParams.get("name");

    if (!name) {
      return new Response(JSON.stringify({ error: "Score name is required" }), { status: 400 });
    }

    const evaluationScore = await getEvaluationScore({
      evaluationResultId,
      name,
      projectId,
    });

    return new Response(JSON.stringify(evaluationScore), {
      status: 200,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return new Response(JSON.stringify({ error: prettifyError(error) }), { status: 400 });
    }

    return new Response(JSON.stringify({ error: "Failed to get evaluation score. Please try again." }), {
      status: 500,
    });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; evaluationResultId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { evaluationResultId, projectId } = params;

  try {
    const body = (await req.json()) as { score: number; name: string };
    const updatedEvaluationScore = await updateEvaluationScore({
      evaluationResultId,
      score: body.score,
      name: body.name,
      projectId,
    });

    return new Response(JSON.stringify(updatedEvaluationScore), {
      status: 200,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return new Response(JSON.stringify({ error: prettifyError(error) }), { status: 400 });
    }

    return new Response(JSON.stringify({ error: "Failed to update evaluation score. Please try again." }), {
      status: 500,
    });
  }
}
