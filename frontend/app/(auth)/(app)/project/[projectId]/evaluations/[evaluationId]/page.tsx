import { and, desc, eq } from "drizzle-orm";
import { type Metadata } from "next";
import { notFound } from "next/navigation";

import Evaluation from "@/components/evaluation/evaluation";
import { getEvaluationDatasets, getEvaluationScoreNames } from "@/lib/actions/evaluation";
import { db } from "@/lib/db/drizzle";
import { datasetsV2, evaluations } from "@/lib/db/migrations/schema";
import { type Evaluation as EvaluationType } from "@/lib/evaluation/types";

export const metadata: Metadata = {
  title: "Evaluation results",
};

export default async function EvaluationPage(props: { params: Promise<{ projectId: string; evaluationId: string }> }) {
  const params = await props.params;

  const evaluationInfo = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.projectId, params.projectId), eq(evaluations.id, params.evaluationId)),
    columns: {
      groupId: true,
      name: true,
      datasetV2Id: true,
    },
  });

  if (!evaluationInfo) {
    return notFound();
  }

  const datasetV2Id = evaluationInfo.datasetV2Id;
  const [evaluationsByGroupId, scoreNames, linkedDatasets, evalDataset] = await Promise.all([
    db.query.evaluations.findMany({
      where: and(eq(evaluations.projectId, params.projectId), eq(evaluations.groupId, evaluationInfo.groupId)),
      orderBy: desc(evaluations.createdAt),
    }),
    getEvaluationScoreNames({ projectId: params.projectId, evaluationId: params.evaluationId }),
    getEvaluationDatasets({ projectId: params.projectId, evaluationId: params.evaluationId }),
    // Linked only once it exists: a run can name a dataset that was never pushed.
    datasetV2Id
      ? db.query.datasetsV2.findFirst({
          where: and(eq(datasetsV2.projectId, params.projectId), eq(datasetsV2.id, datasetV2Id)),
          columns: { id: true },
        })
      : undefined,
  ]);

  return (
    <Evaluation
      evaluationId={params.evaluationId}
      evaluations={evaluationsByGroupId as EvaluationType[]}
      evaluationName={evaluationInfo.name}
      initialScoreNames={scoreNames}
      datasets={linkedDatasets}
      evalDataset={evalDataset?.id ?? null}
    />
  );
}
