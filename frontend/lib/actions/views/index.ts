import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { tableViews } from "@/lib/db/migrations/schema";

export const GetViewsSchema = z.object({
  projectId: z.guid(),
  resource: z.string().min(1),
});

export async function getViews(input: z.infer<typeof GetViewsSchema>) {
  const { projectId, resource } = GetViewsSchema.parse(input);

  return db.query.tableViews.findMany({
    where: and(eq(tableViews.projectId, projectId), eq(tableViews.resource, resource)),
    orderBy: desc(tableViews.updatedAt),
  });
}
