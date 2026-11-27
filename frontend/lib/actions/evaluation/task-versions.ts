import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { evaluations, taskVersions } from "@/lib/db/migrations/schema";

export interface EvaluationTaskVersions {
  /** The eval dataset the run used; null when it names none. */
  dataset: string | null;
  /** Every pushed version of that dataset's tasks, so the table can link only the ones that exist. */
  versions: { task: string; hash: string }[];
}

export async function getEvaluationTaskVersions(
  projectId: string,
  evaluationId: string
): Promise<EvaluationTaskVersions> {
  const evaluation = await db.query.evaluations.findFirst({
    columns: { datasetV2Id: true },
    where: and(eq(evaluations.projectId, projectId), eq(evaluations.id, evaluationId)),
  });
  const dataset = evaluation?.datasetV2Id ?? null;
  if (!dataset) return { dataset: null, versions: [] };

  const versions = await db
    .select({ task: taskVersions.taskId, hash: taskVersions.hash })
    .from(taskVersions)
    .where(and(eq(taskVersions.projectId, projectId), eq(taskVersions.datasetId, dataset)));
  return { dataset, versions };
}
