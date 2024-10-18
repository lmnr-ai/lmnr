import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }): Promise<Response> {
  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  return await fetcher(`/projects/${projectId}/provider-api-keys`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
  });
}


export async function POST(req: NextRequest, { params }: { params: { projectId: string } }): Promise<Response> {
  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  const user = session!.user;
  const body = await req.json();

  return await fetcher(`/projects/${projectId}/provider-api-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }): Promise<Response> {
  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  return await fetcher(`/projects/${projectId}/provider-api-keys?${req.nextUrl.searchParams.toString()}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
  });
}
