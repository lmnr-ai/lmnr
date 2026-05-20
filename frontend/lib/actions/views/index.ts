import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { views } from "@/lib/db/migrations/schema";

export const GetViewsSchema = z.object({
  projectId: z.guid(),
  resourceType: z.string().min(1),
});

export async function getViews(input: z.infer<typeof GetViewsSchema>) {
  const { projectId, resourceType } = GetViewsSchema.parse(input);

  return db.query.views.findMany({
    where: and(eq(views.projectId, projectId), eq(views.resourceType, resourceType)),
    orderBy: desc(views.updatedAt),
  });
}
