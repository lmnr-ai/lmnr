import { type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();

  return await fetch(
    `${process.env.BACKEND_URL}/api/v1/projects/${projectId}/api-keys`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      },
      body: JSON.stringify(body)
    }
  );
}

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  return await fetch(
    `${process.env.BACKEND_URL}/api/v1/projects/${projectId}/api-keys`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${user.apiKey}`
      }
    }
  );
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();

  return await fetch(
    `${process.env.BACKEND_URL}/api/v1/projects/${projectId}/api-keys`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.apiKey}`
      },
      body: JSON.stringify(body)
    }
  );
}
