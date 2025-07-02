import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { renderTemplates } from "@/lib/db/migrations/schema";

export const GetRenderTemplatesSchema = z.object({
  projectId: z.string().uuid(),
});

export async function getRenderTemplates(input: z.infer<typeof GetRenderTemplatesSchema>) {
  const { projectId } = GetRenderTemplatesSchema.parse(input);

  const templates = await db.query.renderTemplates.findMany({
    where: eq(renderTemplates.projectId, projectId),
    columns: {
      id: true,
      name: true,
    },
  });

  return templates;
}
