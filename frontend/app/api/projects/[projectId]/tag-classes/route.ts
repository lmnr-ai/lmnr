import { desc, eq } from "drizzle-orm";

import { apiHandler } from "@/lib/api/api-handler";
import { db } from "@/lib/db/drizzle";
import { tagClasses } from "@/lib/db/migrations/schema";

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;

  const res = await db
    .select()
    .from(tagClasses)
    .where(eq(tagClasses.projectId, projectId))
    .orderBy(desc(tagClasses.createdAt));

  return Response.json(res);
});
