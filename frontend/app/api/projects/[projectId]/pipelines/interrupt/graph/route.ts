import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request, { params }: { params: { projectId: string } }): Promise<Response> {
  const projectId = params.projectId;
  const session = await getServerSession(authOptions)
  const user = session!.user

  const body = await req.json()

  const res = await fetch(`${process.env.BACKEND_URL}/api/v1/projects/${projectId}/pipelines/interrupt/graph`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${user.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  return new Response(res.body)
}
