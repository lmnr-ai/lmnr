import { desc, eq } from 'drizzle-orm';
import {
  pipelines,
  pipelineTemplates,
  pipelineVersions,
  targetPipelineVersions
} from '@/lib/db/migrations/schema';
import {
  DEFAULT_NEW_PIPELINE_VERSION_ID_STRING,
  DEFAULT_PIPELINE_VERSION_NAME,
  PipelineTemplate
} from '@/lib/pipeline/types';
import { db } from '@/lib/db/drizzle';
import { insertNodeIdsToTemplate } from '@/lib/pipeline/utils';
import { z } from 'zod';

export async function GET(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;

  const pipelinesData = await db
    .select({
      id: pipelines.id,
      createdAt: pipelines.createdAt,
      name: pipelines.name,
      projectId: pipelines.projectId,
      visibility: pipelines.visibility,
      targetVersionId: targetPipelineVersions.pipelineVersionId
    })
    .from(pipelines)
    .leftJoin(
      targetPipelineVersions,
      eq(targetPipelineVersions.pipelineId, pipelines.id)
    )
    .where(eq(pipelines.projectId, projectId))
    .orderBy(desc(pipelines.createdAt));

  return new Response(JSON.stringify(pipelinesData), { status: 200 });
}

const CreatePipelineSchema = z.object({
  name: z.string(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']),
  templateId: z.string().optional()
});

export async function POST(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;

  const body = await req.json();

  // Validate request body
  const parseResult = CreatePipelineSchema.safeParse(body);
  if (!parseResult.success) {
    return new Response(
      JSON.stringify({
        error: 'Invalid request body',
        details: parseResult.error.issues
      }),
      { status: 400 }
    );
  }

  const { name, visibility, templateId } = parseResult.data;

  const res = await db
    .insert(pipelines)
    .values({
      name: name,
      visibility: visibility,
      projectId: projectId
    })
    .returning();

  if (res.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Failed to create pipeline' }),
      { status: 500 }
    );
  }

  const templateIdReq = templateId ?? DEFAULT_NEW_PIPELINE_VERSION_ID_STRING;
  const template = await db.query.pipelineTemplates.findFirst({
    where: eq(pipelineTemplates.id, templateIdReq)
  });

  const templateWithNodeIds = await insertNodeIdsToTemplate(
    template as PipelineTemplate
  );

  const pipelineVersionRes = await db
    .insert(pipelineVersions)
    .values({
      pipelineId: res[0].id,
      pipelineType: 'WORKSHOP',
      name: DEFAULT_PIPELINE_VERSION_NAME,
      displayableGraph: templateWithNodeIds.displayableGraph,
      runnableGraph: templateWithNodeIds.runnableGraph
    })
    .returning();

  if (pipelineVersionRes.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Failed to create pipeline version' }),
      { status: 500 }
    );
  }

  return new Response(JSON.stringify(res[0]), { status: 200 });
}
