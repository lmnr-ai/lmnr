import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export async function PUT(
  req: Request,
  { params }: { params: { projectId: string; endpointId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const endpointId = params.endpointId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();

  const res = await fetcher(
    `/projects/${projectId}/endpoints/${endpointId}/checks`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      },
      body: JSON.stringify(body)
    }
  );

  return new Response(res.body);
}
