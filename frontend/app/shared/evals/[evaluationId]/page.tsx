import { notFound } from "next/navigation";

import SharedEvaluation from "@/components/shared/evaluation/shared-evaluation";
import { getSharedEvaluation } from "@/lib/actions/shared/evaluation";

export default async function SharedEvaluationPage(props: {
  params: Promise<{ evaluationId: string }>;
}) {
  const { evaluationId } = await props.params;

  const shared = await getSharedEvaluation({ evaluationId });

  if (!shared) {
    return notFound();
  }

  return <SharedEvaluation evaluationId={evaluationId} evaluationName={shared.evaluation.name} />;
}
