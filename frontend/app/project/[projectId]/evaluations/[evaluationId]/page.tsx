import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Evaluation from '@/components/evaluation/evaluation';
import {
  Evaluation as EvaluationType,
  EvaluationResultsInfo
} from '@/lib/evaluation/types';

export const metadata: Metadata = {
  title: 'Evaluation results'
};

export default async function EvaluationPage({
  params
}: {
  params: { projectId: string; evaluationId: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  const evaluationInfoRes = await fetch(
    `/api/projects/${params.projectId}/evaluations/${params.evaluationId}`
  );

  const evaluationInfo =
    (await evaluationInfoRes.json()) as EvaluationResultsInfo;

  const evaluationsRes = await fetch(
    `/api/projects/${params.projectId}/evaluations?groupId=${evaluationInfo.evaluation.groupId}`
  );

  const evaluations = (await evaluationsRes.json()) as EvaluationType[];

  return (
    <Evaluation evaluationInfo={evaluationInfo} evaluations={evaluations} />
  );
}
