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

  return await fetcher(
    `/projects/${projectId}/endpoints/${endpointId}/log-datasets`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      },
      body: JSON.stringify(body)
    }
  );
}

export async function GET(
  req: Request,
  { params }: { params: { projectId: string; endpointId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const endpointId = params.endpointId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  return await fetcher(
    `/projects/${projectId}/endpoints/${endpointId}/log-datasets`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${user.apiKey}`
      }
    }
  );
}
