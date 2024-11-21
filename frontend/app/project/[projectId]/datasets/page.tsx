import { authOptions } from '@/lib/auth';
import Datasets from '@/components/datasets/datasets';
import { getServerSession } from 'next-auth';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Datasets'
};

export default async function LogsPage({
  params
}: {
  params: { projectId: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  return <Datasets />;
}
