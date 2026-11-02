import { sql } from "drizzle-orm";

import { membersOfWorkspaces } from "@/lib/db/migrations/schema";

// A workspace that fell back to Free after a trial or paid plan (subscription_id is never cleared)
// is owner-only until it upgrades again: Free has a single seat.
export const trialLocked = sql`(${membersOfWorkspaces.memberRole} <> 'owner' AND EXISTS (
  SELECT 1 FROM workspaces w
  JOIN subscription_tiers st ON st.id = w.tier_id
  WHERE w.id = ${membersOfWorkspaces.workspaceId}
    AND w.subscription_id IS NOT NULL
    AND lower(trim(st.name)) = 'free'))`;
export const notTrialLocked = sql`NOT ${trialLocked}`;
