import { and, desc, eq } from "drizzle-orm";
import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod/v4";

import EvaluationTrial from "@/components/evaluation/trial";
import { getEvaluationScoreNames } from "@/lib/actions/evaluation";
import { getEvaluationTrial } from "@/lib/actions/evaluation/trial";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";
import { type Evaluation as EvaluationType } from "@/lib/evaluation/types";

export const metadata: Metadata = {
  title: "Evaluation trial",
};

export default async function EvaluationTrialPage(props: {
  params: Promise<{ projectId: string; evaluationId: string; trialId: string }>;
}) {
  const { projectId, evaluationId, trialId } = await props.params;
  // ClickHouse rejects a malformed UUID parameter outright, so a bad link would 500 instead of 404.
  if (!z.guid().safeParse(trialId).success) return notFound();

  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.projectId, projectId), eq(evaluations.id, evaluationId)),
  });
  if (!evaluation) return notFound();

  const [trial, groupEvaluations, scoreNames] = await Promise.all([
    getEvaluationTrial({ projectId, evaluationId, trialId }),
    db.query.evaluations.findMany({
      where: and(eq(evaluations.projectId, projectId), eq(evaluations.groupId, evaluation.groupId)),
      orderBy: desc(evaluations.createdAt),
    }),
    getEvaluationScoreNames({ projectId, evaluationId }),
  ]);
  if (!trial) return notFound();

  return (
    <EvaluationTrial
      key={trialId}
      evaluation={evaluation as EvaluationType}
      groupEvaluations={groupEvaluations as EvaluationType[]}
      trial={trial}
      scoreNames={scoreNames}
    />
  );
}
