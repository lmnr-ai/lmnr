import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';

export async function GET(
  req: Request,
  { params }: { params: { projectId: string; spanId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const spanId = params.spanId;

  const session = await getServerSession(authOptions);
  const user = session!.user;

  return await fetcher(`/projects/${projectId}/spans/${spanId}/labels`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    }
  });
}

export async function POST(
  req: Request,
  { params }: { params: { projectId: string; spanId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const spanId = params.spanId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();

  if (body.scoreName) {
    body.scoreName = body.scoreName.trim() + (user.name ? ` (${user.name})` : '');
  }

  return await fetcher(`/projects/${projectId}/spans/${spanId}/labels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  });
}
