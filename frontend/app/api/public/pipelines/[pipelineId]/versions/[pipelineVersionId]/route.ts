import { fetcher } from '@/lib/utils';

export async function GET(req: Request, { params }: { params: { pipelineId: string, pipelineVersionId: string } }): Promise<Response> {

  const pipelineId = params.pipelineId;
  const pipelineVersionId = params.pipelineVersionId;

  const res = await fetcher(`/public/pipelines/${pipelineId}/versions/${pipelineVersionId}`, {
    method: 'GET'
  })

  return res
}
