import { fetcher } from '@/lib/utils';

export async function GET(req: Request, { params }: { params: { pipelineId: string } }): Promise<Response> {

  const pipelineId = params.pipelineId;

  const res = await fetcher(`/public/pipelines/${pipelineId}/versions-info`, {
    method: 'GET'
  })

  return res
}
