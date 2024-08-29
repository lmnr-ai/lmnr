import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Datasets from '@/components/datasets/datasets';

export const metadata: Metadata = {
  title: 'Datasets',
}

export default async function LogsPage({
  params,
}: {
  params: { projectId: string },
}) {

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  return (
    <Datasets />
  );
}
