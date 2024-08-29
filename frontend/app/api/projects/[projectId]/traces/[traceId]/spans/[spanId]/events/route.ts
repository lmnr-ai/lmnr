import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request, { params }: { params: { projectId: string, runId: string } }): Promise<Response> {
  const projectId = params.projectId;
  const runId = params.runId;

  const session = await getServerSession(authOptions)
  const user = session!.user

  const res = await fetch(`${process.env.BACKEND_URL}/api/v1/projects/${projectId}/traces/trace/${runId}/tags`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    }
  })

  return new Response(res.body, { status: res.status })
}
