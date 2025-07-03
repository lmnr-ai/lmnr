import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { evaluationScores } from "@/lib/db/migrations/schema";

export const UpdateEvaluationScoreSchema = z.object({
  evaluationResultId: z.string(),
  name: z.string(),
  score: z.number(),
});

export const GetEvaluationScoreSchema = z.object({
  evaluationResultId: z.string(),
  name: z.string(),
});

export async function getEvaluationScore(input: z.infer<typeof GetEvaluationScoreSchema>) {
  const { evaluationResultId, name } = GetEvaluationScoreSchema.parse(input);

  const evaluationScore = await db.query.evaluationScores.findFirst({
    where: and(eq(evaluationScores.resultId, evaluationResultId), eq(evaluationScores.name, name)),
  });

  if (!evaluationScore) {
    return {};
  }

  return evaluationScore;
}

export async function updateEvaluationScore(input: z.infer<typeof UpdateEvaluationScoreSchema>) {
  const { evaluationResultId, name, score } = UpdateEvaluationScoreSchema.parse(input);

  const [updatedEvaluationScore] = await db
    .update(evaluationScores)
    .set({
      score,
    })
    .where(and(eq(evaluationScores.resultId, evaluationResultId), eq(evaluationScores.name, name)))
    .returning();

  if (!updatedEvaluationScore) {
    throw new Error("Evaluation score not found");
  }

  await clickhouseClient.command({
    query: `
        ALTER TABLE default.evaluation_scores 
        UPDATE value = {score: Float64}
        WHERE result_id = {resultId: UUID} AND name = {name: String}
      `,
    query_params: {
      score: score,
      resultId: evaluationResultId,
      name: name,
    },
  });

  return updatedEvaluationScore;
}
