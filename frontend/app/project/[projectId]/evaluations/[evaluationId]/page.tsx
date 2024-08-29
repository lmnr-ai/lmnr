import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { fetcherJSON } from '@/lib/utils';
import { EvaluationResultsInfo } from '@/lib/evaluation/types';
import Evaluation from '@/components/evaluation/evaluation';

const URL_QUERY_PARAMS = {
  COMPARE_EVAL_ID: 'comparedEvaluationId',
}

export const metadata: Metadata = {
  title: 'Evaluation results',
}

export default async function EvaluationPage({
  params,
  searchParams,
}: {
  params: { projectId: string, evaluationId: string },
  searchParams?: { [key: string]: string | string[] | undefined },
}) {

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  const user = session.user;

  const compareEvalId = searchParams?.[URL_QUERY_PARAMS.COMPARE_EVAL_ID] as string | undefined;

  const getEvaluationInfo = fetcherJSON(`/projects/${params.projectId}/evaluations/${params.evaluationId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  });

  function getComparedEvaluationInfo() {
    return new Promise((resolve, reject) => {
      if (compareEvalId) {
        fetcherJSON(`/projects/${params.projectId}/evaluations/${compareEvalId}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${user.apiKey}`
          }
        })
          .then(resolve)
          .catch(reject);
      } else {
        resolve(undefined);
      }
    });
  }

  const getEvaluations = fetcherJSON(`/projects/${params.projectId}/evaluation-infos?excludeId=${params.evaluationId}&onlyFinished=true`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  });

  const [evaluationInfo, comparedEvaluationInfo, evaluations] = await Promise.all([getEvaluationInfo, getComparedEvaluationInfo(), getEvaluations]);

  return (
    <Evaluation
      evaluationInfo={evaluationInfo}
      comparedEvaluationInfo={comparedEvaluationInfo as EvaluationResultsInfo | undefined}
      evaluations={evaluations}
    />
  );
}
