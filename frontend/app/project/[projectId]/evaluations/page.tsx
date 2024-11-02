import { Metadata } from 'next';
import Evaluations from '@/components/evaluations/evaluations';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { evaluations } from '@/lib/db/schema';
import EvalsPagePlaceholder from '@/components/evaluations/page-placeholder';

export const metadata: Metadata = {
  title: 'Evaluations'
};

export default async function EvaluationsPage({
  params
}: {
  params: { projectId: string };
}) {
  const projectId = params.projectId;
  const anyInProject = await db.$count(evaluations, eq(evaluations.projectId, projectId)) > 0;
  if (!anyInProject) {
    return <EvalsPagePlaceholder />;
  }
  return <Evaluations />;
}
