import { and, eq } from "drizzle-orm";

import { createOrUpdateTagClass } from "@/lib/actions/tags";
import { handleRoute,HttpError } from "@/lib/api/route-handler";
import { db } from "@/lib/db/drizzle";
import { tagClasses } from "@/lib/db/migrations/schema";

export const POST = handleRoute<{ projectId: string; tagName: string }, unknown>(async (req, params) => {
  const body = await req.json();
  return await createOrUpdateTagClass({
    projectId: params.projectId,
    name: params.tagName,
    color: body.color,
  });
});

export const DELETE = handleRoute<{ projectId: string; tagName: string }, unknown>(async (_req, params) => {
  const affectedRows = await db
    .delete(tagClasses)
    .where(and(eq(tagClasses.name, params.tagName), eq(tagClasses.projectId, params.projectId)))
    .returning();

  if (affectedRows.length === 0) {
    throw new HttpError("Tag class not found", 404);
  }

  return { success: true };
});
