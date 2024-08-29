import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Evaluations from '@/components/evaluations/evaluations';
import { fetcherJSON } from '@/lib/utils';
import { EvaluationWithPipelineInfo } from '@/lib/evaluation/types';

export const metadata: Metadata = {
  title: 'Evaluations',
}

export default async function EvaluationsPage({
  params,
}: {
  params: { projectId: string },
}) {

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  const user = session.user;

  const evaluations = await fetcherJSON(`/projects/${params.projectId}/evaluations/`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  }) as EvaluationWithPipelineInfo[];

  return (
    <Evaluations evaluations={evaluations} />
  );
}
