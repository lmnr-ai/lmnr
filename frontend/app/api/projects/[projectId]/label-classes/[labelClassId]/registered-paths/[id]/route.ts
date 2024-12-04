import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { labelClassesForPath } from '@/lib/db/migrations/schema';

export async function DELETE(
  req: Request,
  {
    params
  }: { params: { projectId: string; labelClassId: string; id: string } }
): Promise<Response> {

  const projectId = params.projectId;
  const id = params.id;



  const affectedRows = await db.delete(labelClassesForPath).where(eq(labelClassesForPath.id, id)).returning();

  if (affectedRows.length === 0) {
    return new Response('Registered path not found', { status: 404 });
  }

  return new Response(null, { status: 200 });
}
