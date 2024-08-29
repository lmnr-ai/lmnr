import dataset from '@/components/dataset/dataset';
import { authOptions } from '@/lib/auth';
import { fetcherJSON } from '@/lib/utils';
import { Session, getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { Metadata } from 'next'
import Dataset from '@/components/dataset/dataset';

export const metadata: Metadata = {
  title: 'Dataset',
}

const getDatapoints = async (
  session: Session,
  projectId: string,
  datasetId: string,
  pageNumber: number,
  pageSize: number,
) => {
  const user = session.user;
  let url = `/projects/${projectId}/datasets/${datasetId}/datapoints?pageNumber=${pageNumber}&pageSize=${pageSize}`;
  return await fetcherJSON(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${user.apiKey}`
    },
  })
}

export default async function DatasetPage({
  params,
  searchParams,
}: {
  params: { projectId: string; datasetId: string },
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const projectId = params.projectId;
  const datasetId = params.datasetId;
  const session = await getServerSession(authOptions);
  const parseNumericSearchParam = (key: string, defaultValue: number): number => {
    const param = searchParams?.[key];
    if (Array.isArray(param)) {
      return defaultValue;
    }
    const parsed = param ? parseInt(param as string) : defaultValue;
    return isNaN(parsed) ? defaultValue : parsed;
  }
  const pageNumber = parseNumericSearchParam('pageNumber', 0);
  const pageSize = parseNumericSearchParam('pageSize', 50);

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

  const res = await getDatapoints(session, projectId, datasetId, pageNumber, pageSize);
  const datapoints = res?.datapoints ?? [];
  const pageCount = res?.totalEntries ? Math.ceil(res?.totalEntries / pageSize) : 1;

  return (
    <Dataset
      dataset={dataset}
      defaultDatapoints={datapoints}
      pageCount={pageCount}
      pageSize={pageSize}
      pageNumber={pageNumber}
      totalDatapointCount={res?.totalEntries ?? 0}
    />
  );
}
