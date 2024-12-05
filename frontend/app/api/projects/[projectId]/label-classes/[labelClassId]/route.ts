import { and, eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { labelClasses } from '@/lib/db/migrations/schema';
import { fetcher } from '@/lib/utils';

export async function POST(
  req: Request,
  { params }: { params: { projectId: string; labelClassId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const labelClassId = params.labelClassId;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const body = await req.json();

  return await fetcher(`/projects/${projectId}/label-classes/${labelClassId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    },
    body: JSON.stringify(body)
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string; labelClassId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const labelClassId = params.labelClassId;



  const affectedRows = await db.delete(labelClasses).where(
    and(
      eq(labelClasses.id, labelClassId),
      eq(labelClasses.projectId, projectId)
    )
  ).returning();

  if (affectedRows.length === 0) {
    return new Response('Label class not found', { status: 404 });
  }

  return new Response(null, { status: 200 });
}
