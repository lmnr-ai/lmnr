import { db } from '@/lib/db/drizzle';
import { evaluations } from '@/lib/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { isCurrentUserMemberOfProject, paginatedGet } from '@/lib/db/utils';
import { Evaluation } from '@/lib/evaluation/types';

export async function GET(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;

  if (!(await isCurrentUserMemberOfProject(projectId))) {
    return new Response(JSON.stringify({ error: "User is not a member of the project" }), { status: 403 });
  }

  const baseQuery = db.$with(
    "base"
  ).as(
    db
      .select()
      .from(evaluations)
      .where(eq(evaluations.projectId, projectId))
  );

  const result = await paginatedGet<any, Evaluation>({
    table: evaluations,
    pageNumber: 1,
    pageSize: 10,
    baseFilters: [],
    filters: [],
    baseQuery,
    orderBy: desc(sql`created_at`),
  });

  return Response.json(result);
}

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;

  if (!(await isCurrentUserMemberOfProject(projectId))) {
    return new Response(JSON.stringify({ error: "User is not a member of the project" }), { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const evaluationIds = searchParams.get('evaluationIds')?.split(',');

  if (!evaluationIds) {
    return new Response('At least one Evaluation ID is required', { status: 400 });
  }

  try {
    await db.delete(evaluations)
      .where(
        and(
          inArray(evaluations.id, evaluationIds),
          eq(evaluations.projectId, projectId)
        )
      );

    return new Response('Evaluations deleted successfully', { status: 200 });
  } catch (error) {
    console.error('Error deleting evaluations:', error);
    return new Response('Error deleting evaluations', { status: 500 });
  }
}
