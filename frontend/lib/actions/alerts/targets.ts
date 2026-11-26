import { inArray } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { alertTargets } from "@/lib/db/migrations/schema";

import { type AlertTarget } from "./types";

/**
 * Targets of the given alerts, keyed by alert id. Only the current user's own
 * email target is included, so other members' addresses are never exposed.
 * With no `userEmail`, every email target is left out.
 */
export const getTargetsByAlert = async (
  alertIds: string[],
  userEmail?: string
): Promise<Map<string, AlertTarget[]>> => {
  const targetsByAlert = new Map<string, AlertTarget[]>();
  if (alertIds.length === 0) return targetsByAlert;

  const rows = await db
    .select({
      id: alertTargets.id,
      alertId: alertTargets.alertId,
      type: alertTargets.type,
      integrationId: alertTargets.integrationId,
      channelId: alertTargets.channelId,
      channelName: alertTargets.channelName,
      email: alertTargets.email,
    })
    .from(alertTargets)
    .where(inArray(alertTargets.alertId, alertIds));

  for (const { alertId, ...target } of rows) {
    if (target.type === "EMAIL" && (!userEmail || target.email !== userEmail)) continue;
    const list = targetsByAlert.get(alertId) ?? [];
    list.push(target);
    targetsByAlert.set(alertId, list);
  }
  return targetsByAlert;
};
