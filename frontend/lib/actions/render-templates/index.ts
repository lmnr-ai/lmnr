import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { renderTemplates } from "@/lib/db/migrations/schema";

export const GetRenderTemplatesSchema = z.object({
  projectId: z.guid(),
  scope: z.enum(["span", "trace"]).optional(),
});

export async function getRenderTemplates(input: z.infer<typeof GetRenderTemplatesSchema>) {
  const { projectId, scope } = GetRenderTemplatesSchema.parse(input);

  const templates = await db.query.renderTemplates.findMany({
    where: and(
      eq(renderTemplates.projectId, projectId),
      // Legacy rows predate the scope column and are span-scoped via the default.
      scope ? eq(renderTemplates.scope, scope) : undefined
    ),
    columns: {
      id: true,
      name: true,
      createdAt: true,
      scope: true,
    },
    orderBy: desc(renderTemplates.createdAt),
  });

  return templates;
}
