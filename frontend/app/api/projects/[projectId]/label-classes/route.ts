import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { labelClasses } from "@/lib/db/migrations/schema";

export async function GET(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const res = await db
    .select()
    .from(labelClasses)
    .where(eq(labelClasses.projectId, projectId))
    .orderBy(desc(labelClasses.createdAt));

  return new Response(JSON.stringify(res), { status: 200 });
}

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const body = await req.json();

  const res = await db
    .insert(labelClasses)
    .values({
      projectId,
      name: body.name,
      description: body.description,
      evaluatorRunnableGraph: body.evaluatorRunnableGraph,
      color: body.color,
    })
    .returning();

  if (res.length === 0) {
    return new Response(JSON.stringify({ error: "Failed to create label class" }), { status: 500 });
  }

  return new Response(JSON.stringify(res[0]), { status: 200 });
}
