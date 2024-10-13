import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export async function POST(req: Request, { params }: { params: { projectId: string } }): Promise<Response> {

  const projectId = params.projectId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();

  const res = await fetcher(`/projects/${projectId}/event-templates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  });

  return res;
}

export async function GET(req: Request, { params }: { params: { projectId: string } }): Promise<Response> {

  const projectId = params.projectId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  const res = await fetcher(`/projects/${projectId}/event-templates`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
  });

  return res;
}

