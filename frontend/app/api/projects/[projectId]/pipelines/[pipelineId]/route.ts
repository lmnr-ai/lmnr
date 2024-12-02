import { db } from '@/lib/db/drizzle';
import { and, eq } from 'drizzle-orm';
import { pipelines } from '@/lib/db/migrations/schema';
import { z } from 'zod';

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string; pipelineId: string } }
): Promise<Response> {
  const pipelineId = params.pipelineId;

  const res = await db
    .delete(pipelines)
    .where(eq(pipelines.id, pipelineId))
    .returning();

  if (res.length === 0) {
    return new Response('Pipeline not found', { status: 404 });
  }

  return new Response(null, { status: 200 });
}

export async function GET(
  req: Request,
  { params }: { params: { projectId: string; pipelineId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const pipelineId = params.pipelineId;

  const pipelineRes = await db.query.pipelines.findFirst({
    where: and(eq(pipelines.id, pipelineId), eq(pipelines.projectId, projectId))
  });

  if (!pipelineRes) {
    return new Response(JSON.stringify({ error: 'Pipeline not found' }), {
      status: 404
    });
  }

  return new Response(JSON.stringify(pipelineRes), { status: 200 });
}

const UpdatePipelineSchema = z.object({
  name: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional()
});

export async function POST(
  req: Request,
  { params }: { params: { projectId: string; pipelineId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const pipelineId = params.pipelineId;
  const body = await req.json();

  const parseResult = UpdatePipelineSchema.safeParse(body);
  if (!parseResult.success) {
    return new Response(
      JSON.stringify({
        error: 'Invalid request body',
        details: parseResult.error.issues
      }),
      { status: 400 }
    );
  }

  const { name, visibility } = parseResult.data;

  // TODO: Don't allow to make pipelines public if they don't contain commits
  const res = await db
    .update(pipelines)
    .set({
      name,
      visibility
    })
    .where(
      and(eq(pipelines.id, pipelineId), eq(pipelines.projectId, projectId))
    )
    .returning();

  if (res.length === 0) {
    return new Response(JSON.stringify({ error: 'Pipeline not found' }), {
      status: 404
    });
  }

  return new Response(JSON.stringify(res[0]), { status: 200 });
}
