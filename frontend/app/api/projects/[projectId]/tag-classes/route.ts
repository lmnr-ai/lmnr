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
