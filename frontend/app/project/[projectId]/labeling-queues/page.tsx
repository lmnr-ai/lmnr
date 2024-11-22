
import { Metadata } from 'next';

import Queues from '@/components/queues/queues';

export const metadata: Metadata = {
  title: 'Labeling Queues'
};

// required to force reload on each pipeline page visit however apparently this is not working
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function QueuesPage() {
  return <Queues />;
}
