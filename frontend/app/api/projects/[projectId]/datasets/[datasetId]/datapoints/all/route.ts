import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetcher } from '@/lib/utils';

export async function DELETE(req: Request, { params }: { params: { projectId: string, datasetId: string } }): Promise<Response> {
  const projectId = params.projectId;
  const datasetId = params.datasetId;
  const session = await getServerSession(authOptions)
  const user = session!.user

  return await fetcher(`/projects/${projectId}/datasets/${datasetId}/datapoints/all`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
  })
}
