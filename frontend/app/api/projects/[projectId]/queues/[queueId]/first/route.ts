import { isCurrentUserMemberOfProject } from '@/lib/db/utils';
import { db } from '@/lib/db/drizzle';
import { labelingQueueData } from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: { projectId: string; queueId: string } }
) {
  if (!(await isCurrentUserMemberOfProject(params.projectId))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // get first item from queue
  const firstItem = await db
    .select()
    .from(labelingQueueData)
    .where(
      eq(labelingQueueData.queueId, params.queueId)
    )
    .orderBy(asc(labelingQueueData.createdAt))
    .limit(1);

  return Response.json(firstItem);
}
