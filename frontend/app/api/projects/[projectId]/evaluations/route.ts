import { db } from '@/lib/db/drizzle';
import { evaluations } from '@/lib/db/migrations/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { paginatedGet } from '@/lib/db/utils';
import { Evaluation } from '@/lib/evaluation/types';
import { NextRequest } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const groupId = req.nextUrl.searchParams.get('groupId');

  if (groupId && !groupId.trim()) {
    const result = await db
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.projectId, projectId),
          eq(evaluations.groupId, groupId)
        )
      );

    return Response.json(result);
  } else {
    const result = await paginatedGet<any, Evaluation>({
      table: evaluations,
      filters: [eq(evaluations.projectId, projectId)],
      orderBy: desc(evaluations.createdAt)
    });

    return Response.json(result);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;

  const { searchParams } = new URL(req.url);
  const evaluationIds = searchParams.get('evaluationIds')?.split(',');

  if (!evaluationIds) {
    return new Response('At least one Evaluation ID is required', {
      status: 400
    });
  }

  try {
    await db
      .delete(evaluations)
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
