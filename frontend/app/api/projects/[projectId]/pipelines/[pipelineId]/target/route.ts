import { db } from '@/lib/db/drizzle';
import {
  pipelines,
  pipelineVersions,
  targetPipelineVersions
} from '@/lib/db/migrations/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const UpdateTargetPipelineVersionSchema = z.object({
  pipelineVersionId: z.string()
});
export async function POST(
  req: Request,
  { params }: { params: { projectId: string; pipelineId: string } }
): Promise<Response> {
  const projectId = params.projectId;
  const pipelineId = params.pipelineId;
  const body = await req.json();

  const parseResult = UpdateTargetPipelineVersionSchema.safeParse(body);
  if (!parseResult.success) {
    return new Response(
      JSON.stringify({
        error: 'Invalid request body',
        details: parseResult.error.issues
      }),
      { status: 400 }
    );
  }

  const { pipelineVersionId } = parseResult.data;

  const pipelineVersion = await db
    .select({
      pipelineType: pipelineVersions.pipelineType,
      pipelineName: pipelines.name
    })
    .from(pipelineVersions)
    .innerJoin(pipelines, eq(pipelineVersions.pipelineId, pipelines.id))
    .where(eq(pipelineVersions.id, pipelineVersionId))
    .limit(1); // Ensure only one result is fetched

  if (!pipelineVersion) {
    return new Response(
      JSON.stringify({
        error: 'Pipeline version not found'
      }),
      { status: 404 }
    );
  }
  if (pipelineVersion[0].pipelineType !== 'COMMIT') {
    return new Response(
      JSON.stringify({
        error: 'Only COMMIT pipeline versions can be set as target'
      }),
      { status: 400 }
    );
  }

  const targetPipelineVersion = await db
    .insert(targetPipelineVersions)
    .values({
      pipelineId,
      pipelineVersionId
    })
    .onConflictDoUpdate({
      target: [targetPipelineVersions.pipelineId],
      set: { pipelineVersionId }
    })
    .returning();

  if (!targetPipelineVersion) {
    return new Response(
      JSON.stringify({
        error: 'Failed to update target pipeline version'
      }),
      { status: 500 }
    );
  }

  return new Response(JSON.stringify(targetPipelineVersion), { status: 200 });
}
