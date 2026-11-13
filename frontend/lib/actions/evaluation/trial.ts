import { flattenScores } from "@/components/evaluation/utils";
import { executeQuery } from "@/lib/actions/sql";
import { type EvalRow } from "@/lib/evaluation/types";

/** One Trial of `evaluationId` with its scores flattened to `score:<name>`; undefined when it isn't there. */
export const getEvaluationTrial = async ({
  projectId,
  evaluationId,
  trialId,
}: {
  projectId: string;
  evaluationId: string;
  trialId: string;
}): Promise<EvalRow | undefined> => {
  const [row] = await executeQuery<EvalRow>({
    query: `
      SELECT id, task_id taskId, \`index\`, trace_id traceId, metadata, scores
      FROM evaluation_datapoints
      WHERE evaluation_id = {evaluationId:UUID} AND id = {trialId:UUID}
      LIMIT 1
    `,
    parameters: { evaluationId, trialId },
    projectId,
  });
  return row && { ...row, ...flattenScores(row["scores"]) };
};
