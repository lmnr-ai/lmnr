import { and, eq } from "drizzle-orm";

import { createOrUpdateTagClass } from "@/lib/actions/tags";
import { handlerWithAudit } from "@/lib/audit";
import { db } from "@/lib/db/drizzle";
import { tagClasses } from "@/lib/db/migrations/schema";

export const POST = handlerWithAudit<{ projectId: string; tagName: string }>(
  { resource: "tag_class", action: "create" },
  async (req, ctx, audit) => {
    const params = await ctx.params;
    const projectId = params.projectId;
    const tagName = params.tagName;
    await audit.target(tagName, { name: tagName });
    const body = await req.json();

    const { created, ...tagClass } = await createOrUpdateTagClass({
      projectId,
      name: tagName,
      color: body.color,
    });
    // An existing class only gets a new color.
    if (!created) audit.set({ action: "update" });
    return Response.json(tagClass, { status: 200 });
  }
);

export const DELETE = handlerWithAudit<{ projectId: string; tagName: string }>(
  { resource: "tag_class", action: "delete" },
  async (_req, ctx, audit) => {
    const params = await ctx.params;
    const projectId = params.projectId;
    const tagName = params.tagName;
    await audit.target(tagName, { name: tagName });

    const affectedRows = await db
      .delete(tagClasses)
      .where(and(eq(tagClasses.name, tagName), eq(tagClasses.projectId, projectId)))
      .returning();

    if (affectedRows.length === 0) {
      return new Response("Tag class not found", { status: 404 });
    }

    return new Response(null, { status: 200 });
  }
);
