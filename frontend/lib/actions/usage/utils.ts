import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";

export const isFreeTierWorkspace = async (workspaceId: string): Promise<boolean> => {
  const result = await db
    .select({ tierName: subscriptionTiers.name })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return result.length > 0 && result[0].tierName.toLowerCase() === "free";
};
