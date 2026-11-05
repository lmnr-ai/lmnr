import { and, eq } from "drizzle-orm";

import { createOrUpdateTagClass } from "@/lib/actions/tags";
import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db/drizzle";
import { tagClasses } from "@/lib/db/migrations/schema";

export const POST = withAudit<{ projectId: string; tagName: string }>(
  { resource: "tag_class", action: "create" },
  async (req, ctx, audit) => {
    const params = await ctx.params;
    const projectId = params.projectId;
    const tagName = params.tagName;
    await audit.target(tagName, { name: tagName });
    const body = await req.json();

    // An existing class only gets a new color.
    const [existing] = await db
      .select({ name: tagClasses.name })
      .from(tagClasses)
      .where(and(eq(tagClasses.name, tagName), eq(tagClasses.projectId, projectId)))
      .limit(1);
    if (existing) audit.set({ action: "update" });

    const result = await createOrUpdateTagClass({
      projectId,
      name: tagName,
      color: body.color,
    });
    return Response.json(result, { status: 200 });
  }
);

export const DELETE = withAudit<{ projectId: string; tagName: string }>(
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
