import { db } from '@/lib/db/drizzle';
import { labelClasses } from '@/lib/db/migrations/schema';
import { eq } from 'drizzle-orm';
import { isCurrentUserMemberOfProject } from '@/lib/db/utils';


export async function GET(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;

  if (!(await isCurrentUserMemberOfProject(projectId))) {
    return new Response(JSON.stringify({ error: "User is not a member of the project" }), { status: 403 });
  }

  const res = await db.select().from(labelClasses).where(eq(labelClasses.projectId, projectId));

  return new Response(JSON.stringify(res), { status: 200 });

}

export async function POST(
  req: Request,
  { params }: { params: { projectId: string } }
): Promise<Response> {
  const projectId = params.projectId;

  if (!(await isCurrentUserMemberOfProject(projectId))) {
    return new Response(JSON.stringify({ error: "User is not a member of the project" }), { status: 403 });
  }

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
