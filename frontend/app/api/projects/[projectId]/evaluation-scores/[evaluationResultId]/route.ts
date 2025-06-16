import { NextRequest } from "next/server";

import {
  getEvaluationScore,
  GetEvaluationScoreSchema,
  updateEvaluationScore,
  UpdateEvaluationScoreSchema,
} from "@/lib/actions/evaluation-score";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluationResultId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { evaluationResultId } = params;

  try {
    const name = req.nextUrl.searchParams.get("name");
    const result = GetEvaluationScoreSchema.omit({ evaluationResultId: true }).safeParse({ name: name });

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: result.error.issues,
        }),
        {
          status: 400,
        }
      );
    }

    const { name: scoreName } = result.data;

    const evaluationScore = await getEvaluationScore({
      evaluationResultId,
      name: scoreName,
    });

    return new Response(JSON.stringify(evaluationScore), {
      status: 200,
    });
  } catch (error) {
    console.error("Error fetching evaluation score:", error);
    if (error instanceof Error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.message === "Evaluation score not found" ? 404 : 500,
      });
    }

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
    });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; evaluationResultId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { evaluationResultId } = params;

  try {
    const body = await req.json();
    const result = UpdateEvaluationScoreSchema.omit({ evaluationResultId: true }).safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: result.error.issues,
        }),
        {
          status: 400,
        }
      );
    }

    const { score, name } = result.data;

    const updatedEvaluationScore = await updateEvaluationScore({
      evaluationResultId,
      score,
      name,
    });

    return new Response(JSON.stringify(updatedEvaluationScore), {
      status: 200,
    });
  } catch (error) {
    console.error("Error updating evaluation score:", error);
    if (error instanceof Error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.message === "Evaluation score not found" ? 404 : 500,
      });
    }

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
    });
  }
}
