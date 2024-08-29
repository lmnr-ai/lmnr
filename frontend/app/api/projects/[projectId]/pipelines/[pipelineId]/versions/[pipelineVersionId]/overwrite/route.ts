import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetcher } from '@/lib/utils';

export async function POST(req: Request, { params }: { params: { projectId: string, pipelineId: string, pipelineVersionId: string } }): Promise<Response> {

  const projectId = params.projectId;
  const pipelineId = params.pipelineId;
  const pipelineVersionId = params.pipelineVersionId;

  const session = await getServerSession(authOptions)
  const user = session!.user

  const body = await req.json()

  const res = await fetcher(`/projects/${projectId}/pipelines/${pipelineId}/versions/${pipelineVersionId}/overwrite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  })

  return res
}
