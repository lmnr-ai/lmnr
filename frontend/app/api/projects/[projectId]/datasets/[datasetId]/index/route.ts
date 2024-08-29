import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetcher } from '@/lib/utils'

export async function POST(req: Request, { params }: { params: { projectId: string, datasetId: string } }): Promise<Response> {
  const projectId = params.projectId
  const datasetId = params.datasetId
  const session = await getServerSession(authOptions)
  const user = session!.user

  const body = await req.json()

  const res = await fetcher(`/projects/${projectId}/datasets/${datasetId}/index`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  })

  return new Response(res.body)
}
