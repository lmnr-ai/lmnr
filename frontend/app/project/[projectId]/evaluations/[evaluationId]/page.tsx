import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { fetcherJSON } from '@/lib/utils';
import Evaluation from '@/components/evaluation/evaluation';

export const metadata: Metadata = {
  title: 'Evaluation results',
}

export default async function EvaluationPage({params}: {params: { projectId: string, evaluationId: string }}) {

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  const user = session.user;

  const getEvaluationInfo = fetcherJSON(`/projects/${params.projectId}/evaluations/${params.evaluationId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  });

  // Expect backend to return only evaluations from the current group based on the current evaluation id
  const getEvaluations = fetcherJSON(`/projects/${params.projectId}/evaluations?currentEvaluationId=${params.evaluationId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  });

  const [evaluationInfo, evaluations] = await Promise.all([getEvaluationInfo, getEvaluations]);

  return (
    <Evaluation
      evaluationInfo={evaluationInfo}
      evaluations={evaluations}
    />
  );
}
