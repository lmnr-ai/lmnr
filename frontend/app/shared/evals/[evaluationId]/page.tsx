import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SharedEvaluation from "@/components/shared/evaluation/shared-evaluation";
import { getSharedEvaluation } from "@/lib/actions/shared/evaluation";

export const generateMetadata = async (props: { params: Promise<{ evaluationId: string }> }): Promise<Metadata> => {
  const { evaluationId } = await props.params;
  try {
    const shared = await getSharedEvaluation({ evaluationId });
    if (!shared) {
      return { title: "Shared Evaluation" };
    }
    const title = `${shared.evaluation.name} - Shared Evaluation`;
    const description = `View the shared evaluation "${shared.evaluation.name}" on Laminar.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        url: `https://laminar.sh/shared/evals/${evaluationId}`,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  } catch {
    return { title: "Shared Evaluation" };
  }
};

export default async function SharedEvaluationPage(props: { params: Promise<{ evaluationId: string }> }) {
  const { evaluationId } = await props.params;

  const shared = await getSharedEvaluation({ evaluationId });

  if (!shared) {
    return notFound();
  }

  return <SharedEvaluation evaluationId={evaluationId} evaluationName={shared.evaluation.name} />;
}
