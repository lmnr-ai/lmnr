import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; endpointId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const endpointId = params.endpointId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const res = await fetcher(`/projects/${projectId}/endpoints/${endpointId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  });

  return new Response(res.body);
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ projectId: string; endpointId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const endpointId = params.endpointId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  const res = await fetcher(`/projects/${projectId}/endpoints/${endpointId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  });

  return new Response(res.body);
}
