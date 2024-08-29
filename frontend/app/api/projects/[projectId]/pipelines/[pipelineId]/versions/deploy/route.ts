import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request, { params }: { params: { projectId: string, pipelineId: string } }): Promise<Response> {

  const projectId = params.projectId;
  const pipelineId = params.pipelineId;

  const session = await getServerSession(authOptions)
  const user = session!.user

  const body = await req.json();
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1/projects/${projectId}/pipelines/${pipelineId}/versions/deploy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  })

  return new Response(res.body, { status: res.status })
}
