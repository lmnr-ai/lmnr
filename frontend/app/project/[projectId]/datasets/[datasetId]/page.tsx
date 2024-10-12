import dataset from '@/components/dataset/dataset';
import { authOptions } from '@/lib/auth';
import { fetcherJSON } from '@/lib/utils';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { Metadata } from 'next';
import Dataset from '@/components/dataset/dataset';

export const metadata: Metadata = {
  title: 'Dataset',
};

export default async function DatasetPage({
  params,
}: {
  params: { projectId: string; datasetId: string },
}) {
  const projectId = params.projectId;
  const datasetId = params.datasetId;
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/sign-in');
  }

  const user = session.user;

  const dataset = await fetcherJSON(
    `/projects/${projectId}/datasets/${datasetId}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      }
    }
  );


  return (
    <Dataset
      dataset={dataset}
    />
  );
}
