import { and, eq } from "drizzle-orm";

import { createOrUpdateTagClass } from "@/lib/actions/tags";
import { handleRoute } from "@/lib/api/route-handler";
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
    throw new Error("Tag class not found");
  }

  return { success: true };
});
