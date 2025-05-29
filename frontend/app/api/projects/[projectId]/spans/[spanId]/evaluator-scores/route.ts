import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db/drizzle";
import { evaluators, evaluatorScores } from "@/lib/db/migrations/schema";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { spanId } = params;

  try {
    const scores = await db
      .select({
        id: evaluatorScores.id,
        spanId: evaluatorScores.spanId,
        evaluatorId: evaluatorScores.evaluatorId,
        score: evaluatorScores.score,
        createdAt: evaluatorScores.createdAt,
        evaluatorName: evaluators.name,
      })
      .from(evaluatorScores)
      .leftJoin(evaluators, eq(evaluatorScores.evaluatorId, evaluators.id))
      .where(eq(evaluatorScores.spanId, spanId))
      .orderBy(evaluatorScores.createdAt);

    return Response.json(scores);
  } catch (error) {
    console.error("Error fetching evaluator scores:", error);
    return Response.json({ error: "Failed to fetch evaluator scores" }, { status: 500 });
  }
}
