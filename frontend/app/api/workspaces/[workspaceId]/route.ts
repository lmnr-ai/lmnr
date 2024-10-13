import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export async function GET(req: Request, { params }: { params: { workspaceId: string } }): Promise<Response> {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const res = await fetcher(`/workspaces/${params.workspaceId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
  });

  return new Response(res.body);
}
