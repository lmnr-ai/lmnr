import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcher } from '@/lib/utils';
import { NextRequest } from 'next/server';
import { isCurrentUserMemberOfProject } from '@/lib/db/utils';

import { db } from '@/lib/db/drizzle';
import { and, eq } from 'drizzle-orm';
import { providerApiKeys } from '@/lib/db/migrations/schema';
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }): Promise<Response> {
  const projectId = params.projectId;

  if (!(await isCurrentUserMemberOfProject(projectId))) {
    return new Response(JSON.stringify({ error: "User is not a member of the project" }), { status: 403 });
  }

  const res = await db.select({
    name: providerApiKeys.name,
    createdAt: providerApiKeys.createdAt,
  }).from(providerApiKeys).where(eq(providerApiKeys.projectId, projectId));

  return new Response(JSON.stringify(res), { status: 200 });
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

  if (!(await isCurrentUserMemberOfProject(projectId))) {
    return new Response(JSON.stringify({ error: "User is not a member of the project" }), { status: 403 });
  }

  const name = req.nextUrl.searchParams.get('name') ?? '';

  const res = await db.delete(providerApiKeys).where(and(eq(providerApiKeys.name, name), eq(providerApiKeys.projectId, projectId))).returning();

  if (res.length !== 1) {
    return new Response(JSON.stringify({ error: "Provider API key not found" }), { status: 400 });
  }

  return new Response(null, { status: 200 });
}
