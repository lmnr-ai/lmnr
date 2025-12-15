import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";

export const UpdateEvaluationScoreSchema = z.object({
  evaluationResultId: z.string(),
  name: z.string(),
  score: z.number(),
});

export const GetEvaluationScoreSchema = z.object({
  evaluationResultId: z.string(),
  name: z.string(),
  projectId: z.string(),
});

export async function getEvaluationScore(input: z.infer<typeof GetEvaluationScoreSchema>) {
  const { evaluationResultId, name, projectId } = GetEvaluationScoreSchema.parse(input);

  const evaluationScoreResult = await clickhouseClient.query({
    query: `
      SELECT name, value score, project_id FROM evaluation_scores
      WHERE evaluation_datapoint_id = {resultId: UUID} AND name = {name: String}
      AND project_id = {projectId: UUID}
    `,
    query_params: {
      resultId: evaluationResultId,
      name: name,
      projectId: projectId,
    },
  });

  const evaluationScore = (await evaluationScoreResult.json()).data[0] as { value: number };

  if (!evaluationScore) {
    return {};
  }

  return evaluationScore;
}

export async function updateEvaluationScore(input: z.infer<typeof UpdateEvaluationScoreSchema>) {
  const { evaluationResultId, name, score } = UpdateEvaluationScoreSchema.parse(input);

  await clickhouseClient.command({
    query: `
        ALTER TABLE default.evaluation_scores 
        UPDATE value = {score: Float64}
        WHERE evaluation_datapoint_id = {resultId: UUID} AND name = {name: String}
      `,
    query_params: {
      score: score,
      resultId: evaluationResultId,
      name: name,
    },
  });

  return {
    resultId: evaluationResultId,
    name,
    score,
  };
}
