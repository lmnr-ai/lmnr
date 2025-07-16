import { type NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/migrations/schema';
import { isCurrentUserMemberOfWorkspace } from '@/lib/db/utils';

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  if (!user) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await req.json();

  if (!(await isCurrentUserMemberOfWorkspace(body.workspaceId))) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const project = await db.insert(projects).values({
    name: body.name,
    workspaceId: body.workspaceId,
  }).returning();

  if (project.length === 0) {
    return new NextResponse(JSON.stringify({ error: 'Failed to create project' }), { status: 500 });
  }

  return NextResponse.json(project[0]);
}
