import { desc, eq } from "drizzle-orm";

import { handleRoute } from "@/lib/api/route-handler";
import { db } from "@/lib/db/drizzle";
import { tagClasses } from "@/lib/db/migrations/schema";

export const GET = handleRoute<{ projectId: string }, unknown>(
  async (_req, params) =>
    await db
      .select()
      .from(tagClasses)
      .where(eq(tagClasses.projectId, params.projectId))
      .orderBy(desc(tagClasses.createdAt))
);
