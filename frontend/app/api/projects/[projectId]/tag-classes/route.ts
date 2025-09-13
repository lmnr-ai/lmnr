import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { tagClasses } from "@/lib/db/migrations/schema";

export async function GET(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const res = await db
    .select()
    .from(tagClasses)
    .where(eq(tagClasses.projectId, projectId))
    .orderBy(desc(tagClasses.createdAt));

  return new Response(JSON.stringify(res), { status: 200 });
}

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const body = await req.json();

  const res = await db
    .insert(tagClasses)
    .values({
      projectId,
      name: body.name,
      color: body.color,
    })
    .returning();

  if (res.length === 0) {
    return new Response(JSON.stringify({ error: "Failed to create tag class" }), { status: 500 });
  }

  return new Response(JSON.stringify(res[0]), { status: 200 });
}
