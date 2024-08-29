import Pipeline from '@/components/pipeline/pipeline';
import { authOptions } from '@/lib/auth';
import { PipelineVersion } from '@/lib/pipeline/types';
import { fetcherJSON } from '@/lib/utils';
import { Session, getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Metadata } from 'next'

const URL_QUERY_PARAMS = {
  SELECTED_VERSION_ID: 'versionId',
}

// TODO: Add pipeline name to the params
export const metadata: Metadata = {
  title: 'Pipeline',
}

// required to force reload on each pipeline page visit
export const dynamic = 'force-dynamic'
export const revalidate = 0

const getPipelineVersion = async (session: Session, projectId: string, pipelineId: string, versionId: string): Promise<PipelineVersion> => {
  const user = session.user
  return await fetcherJSON(`/projects/${projectId}/pipelines/${pipelineId}/versions/${versionId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${user.apiKey}`
    },
  });
}

export default async function PipelinePage({
  params,
  searchParams,
}: {
  params: { projectId: string; pipelineId: string };
  searchParams?: { [key: string]: string | string[] | undefined }
}) {

  const projectId = params.projectId;
  const pipelineId = params.pipelineId;
  const session = await getServerSession(authOptions);
  const selectedVersionId = searchParams?.[URL_QUERY_PARAMS.SELECTED_VERSION_ID];

  if (!session) {
    redirect('/sign-in');
  }

  const user = session.user;

  const pipeline = await fetcherJSON(
    `/projects/${projectId}/pipelines/${pipelineId}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      }
    }
  );
  const selectedVersion = selectedVersionId
    ? await getPipelineVersion(session, projectId, pipelineId, selectedVersionId as string)
    : undefined;

  return (
    <>
      <Pipeline pipeline={pipeline} defaultSelectedVersion={selectedVersion} />
    </>
  );
}
