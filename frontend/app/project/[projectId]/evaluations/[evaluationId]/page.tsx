import { and, desc, eq } from "drizzle-orm";
import { Metadata } from "next";
import { notFound } from "next/navigation";

import Evaluation from "@/components/evaluation/evaluation";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";
import { Evaluation as EvaluationType } from "@/lib/evaluation/types";

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
    },
  });

  if (!evaluationInfo) {
    return notFound();
  }

  const evaluationsByGroupId = await db.query.evaluations.findMany({
    where: and(eq(evaluations.projectId, params.projectId), eq(evaluations.groupId, evaluationInfo.groupId)),
    orderBy: desc(evaluations.createdAt),
  });

  return (
    <Evaluation
      evaluationId={params.evaluationId}
      evaluations={evaluationsByGroupId as EvaluationType[]}
      evaluationName={evaluationInfo.name}
    />
  );
}
