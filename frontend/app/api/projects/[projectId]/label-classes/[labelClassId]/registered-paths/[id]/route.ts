import { db } from '@/lib/db/drizzle';
import { labelClassesForPath } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { isCurrentUserMemberOfProject } from '@/lib/db/utils';

export async function DELETE(
  req: Request,
  {
    params
  }: { params: { projectId: string; labelClassId: string; id: string } }
): Promise<Response> {

  const projectId = params.projectId;
  const id = params.id;

  if (!(await isCurrentUserMemberOfProject(projectId))) {
    return new Response(JSON.stringify({ error: "User is not a member of the project" }), { status: 403 });
  }

  const affectedRows = await db.delete(labelClassesForPath).where(eq(labelClassesForPath.id, id)).returning();

  if (affectedRows.length === 0) {
    return new Response('Registered path not found', { status: 404 });
  }

  return new Response(null, { status: 200 });
}
