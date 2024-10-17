import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export async function DELETE(req: Request, { params }: { params: { projectId: string, labelClassId: string, id: string } }): Promise<Response> {
  const projectId = params.projectId;
  const labelClassId = params.labelClassId;
  const id = params.id;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  return await fetcher(`/projects/${projectId}/label-classes/${labelClassId}/registered-paths/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
  });
}
