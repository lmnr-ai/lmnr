import { Feature, isFeatureEnabled } from '@/lib/features/features';
import { Session } from 'next-auth';
import { fetcherJSON } from '@/lib/utils';
import { Metadata } from 'next';
import Pipeline from '@/components/pipeline/pipeline';
import {
  Pipeline as PipelineType,
  PipelineVersion,
  PipelineVisibility
} from '@/lib/pipeline/types';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { pipelines, targetPipelineVersions } from '@/lib/db/migrations/schema';
import { eq } from 'drizzle-orm';

const URL_QUERY_PARAMS = {
  SELECTED_VERSION_ID: 'versionId'
};

// TODO: Add pipeline name to the params
export const metadata: Metadata = {
  title: 'Pipeline'
};

// required to force reload on each pipeline page visit
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const getPipelineVersion = async (
  session: Session,
  projectId: string,
  pipelineId: string,
  versionId: string
): Promise<PipelineVersion> => {
  const user = session.user;
  return await fetcherJSON(
    `/projects/${projectId}/pipelines/${pipelineId}/versions/${versionId}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      }
    }
  );
};

export default async function PipelinePage({
  params,
  searchParams
}: {
  params: { projectId: string; pipelineId: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const pipelineId = params.pipelineId;

  const pipelineData = await db
    .select({
      id: pipelines.id,
      createdAt: pipelines.createdAt,
      name: pipelines.name,
      projectId: pipelines.projectId,
      visibility: pipelines.visibility,
      targetVersionId: targetPipelineVersions.pipelineVersionId
    })
    .from(pipelines)
    .leftJoin(
      targetPipelineVersions,
      eq(targetPipelineVersions.pipelineId, pipelines.id)
    )
    .where(eq(pipelines.id, pipelineId))
    .limit(1)
    .then((res) => {
      if (res[0]) {
        return res[0];
      }
      return undefined;
    });

  if (!pipelineData) {
    redirect('/404');
  }

  // cast visibility to PipelineVisibility
  const pipeline: PipelineType = {
    ...pipelineData,
    visibility: pipelineData.visibility as PipelineVisibility
  };
  const isSupabaseEnabled = isFeatureEnabled(Feature.SUPABASE);

  return (
    <>
      <Pipeline pipeline={pipeline} isSupabaseEnabled={isSupabaseEnabled} />
    </>
  );
}
