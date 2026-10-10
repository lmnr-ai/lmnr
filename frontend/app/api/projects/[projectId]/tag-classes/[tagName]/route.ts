import { and, eq } from "drizzle-orm";

import { createOrUpdateTagClass } from "@/lib/actions/tags";
import { apiHandler } from "@/lib/api/api-handler";
import { db } from "@/lib/db/drizzle";
import { tagClasses } from "@/lib/db/migrations/schema";

export const POST = apiHandler<{ projectId: string; tagName: string }>(async (req, ctx) => {
  const params = await ctx.params;
  const projectId = params.projectId;
  const tagName = params.tagName;
  const body = await req.json();

  const result = await createOrUpdateTagClass({
    projectId,
    name: tagName,
    color: body.color,
  });
  return Response.json(result, { status: 200 });
});

export const DELETE = apiHandler<{ projectId: string; tagName: string }>(async (_req, ctx) => {
  const params = await ctx.params;
  const projectId = params.projectId;
  const tagName = params.tagName;

  const affectedRows = await db
    .delete(tagClasses)
    .where(and(eq(tagClasses.name, tagName), eq(tagClasses.projectId, projectId)))
    .returning();

  if (affectedRows.length === 0) {
    return new Response("Tag class not found", { status: 404 });
  }

  return new Response(null, { status: 200 });
});
