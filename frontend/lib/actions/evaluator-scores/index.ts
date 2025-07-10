import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { evaluatorScores } from "@/lib/db/migrations/schema";

const GetEvaluatorScoresSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
});

export const getEvaluatorScores = async (input: z.infer<typeof GetEvaluatorScoresSchema>) => {
  const { spanId, projectId } = GetEvaluatorScoresSchema.parse(input);
  const scores = await db
    .select({
      id: evaluatorScores.id,
      spanId: evaluatorScores.spanId,
      evaluatorId: evaluatorScores.evaluatorId,
      score: evaluatorScores.score,
      createdAt: evaluatorScores.createdAt,
      name: evaluatorScores.name,
      source: evaluatorScores.source,
      metadata: evaluatorScores.metadata,
    })
    .from(evaluatorScores)
    .where(and(eq(evaluatorScores.spanId, spanId), eq(evaluatorScores.projectId, projectId)))
    .orderBy(evaluatorScores.createdAt);

  return scores;
};
