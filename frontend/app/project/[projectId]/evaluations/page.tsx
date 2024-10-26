import { Metadata } from 'next';
import Evaluations from '@/components/evaluations/evaluations';

export const metadata: Metadata = {
  title: 'Evaluations'
};

export default async function EvaluationsPage({
  params
}: {
  params: { projectId: string };
}) {
  return <Evaluations />;
}
