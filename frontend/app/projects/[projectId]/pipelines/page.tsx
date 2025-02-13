import { Metadata } from 'next';

import Pipelines from '@/components/pipelines/pipelines';

export const metadata: Metadata = {
  title: 'Pipelines'
};

// required to force reload on each pipeline page visit however apparently this is not working
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PipelinesPage() {
  return <Pipelines />;
}
