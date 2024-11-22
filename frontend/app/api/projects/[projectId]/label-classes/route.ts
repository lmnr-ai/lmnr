import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { labelClasses } from '@/lib/db/migrations/schema';



export async function GET(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;



  const res = await db
    .select()
    .from(labelClasses)
    .where(eq(labelClasses.projectId, projectId))
    .orderBy(desc(labelClasses.createdAt));

  return new Response(JSON.stringify(res), { status: 200 });

}

export async function POST(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;



  const body = await req.json();

  const res = await db.insert(labelClasses).values({
    projectId: projectId,
    name: body.name,
    description: body.description,
    labelType: body.labelType,
    evaluatorRunnableGraph: body.evaluatorRunnableGraph,
    valueMap: body.valueMap
  }).returning();

  if (res.length === 0) {
    return new Response(JSON.stringify({ error: "Failed to create label class" }), { status: 500 });
  }

  return new Response(JSON.stringify(res[0]), { status: 200 });

}
