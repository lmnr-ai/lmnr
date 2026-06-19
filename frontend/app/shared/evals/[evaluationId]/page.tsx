import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import PageViewTracker from "@/components/common/page-view-tracker";
import SharedEvaluation from "@/components/shared/evaluation/shared-evaluation";
import { getEvaluationScoreNames } from "@/lib/actions/evaluation";
import { getSharedEvaluation } from "@/lib/actions/shared/evaluation";

const getCachedSharedEvaluation = cache((evaluationId: string) => getSharedEvaluation({ evaluationId }));

export const generateMetadata = async (props: { params: Promise<{ evaluationId: string }> }): Promise<Metadata> => {
  const { evaluationId } = await props.params;
  try {
    const shared = await getCachedSharedEvaluation(evaluationId);
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
        images: { url: "/opengraph-image.png", alt: "Laminar", width: 1200, height: 630 },
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: { url: "/twitter-image.png", alt: "Laminar", width: 1200, height: 630 },
      },
    };
  } catch {
    return { title: "Shared Evaluation" };
  }
};

export default async function SharedEvaluationPage(props: { params: Promise<{ evaluationId: string }> }) {
  const { evaluationId } = await props.params;

  const shared = await getCachedSharedEvaluation(evaluationId);

  if (!shared) {
    return notFound();
  }

  const scoreNames = await getEvaluationScoreNames({ projectId: shared.projectId, evaluationId });

  return (
    <>
      <PageViewTracker feature="shared" action="evaluation_viewed" properties={{ evaluationId }} />
      <SharedEvaluation
        evaluationId={evaluationId}
        evaluationName={shared.evaluation.name}
        initialScoreNames={scoreNames}
      />
    </>
  );
}
