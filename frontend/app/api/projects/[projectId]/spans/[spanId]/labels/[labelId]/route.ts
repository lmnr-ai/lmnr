import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';
import { getServerSession } from 'next-auth';

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string; spanId: string; labelId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const spanId = params.spanId;
  const labelId = params.labelId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  return await fetcher(
    `/projects/${projectId}/spans/${spanId}/labels/${labelId}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      }
    }
  );
}
