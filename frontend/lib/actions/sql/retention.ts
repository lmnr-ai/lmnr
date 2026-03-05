import { format, isBefore, parseISO, subDays } from "date-fns";

import { getProjectBillingInfo } from "@/lib/actions/usage/limits.ts";
import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";
import { WorkspaceTier } from "@/lib/workspaces/types.ts";

import type { QueryResultMeta } from "./types";

interface RetentionResult {
  parameters: Record<string, any> | undefined;
  meta: QueryResultMeta;
}

const TIER_RETENTION_DAYS: Record<string, number> = {
  [WorkspaceTier.FREE]: 15,
  [WorkspaceTier.HOBBY]: 30,
  [WorkspaceTier.PRO]: 90,
};

const TIME_PARAM_KEYS = ["start_time", "startTime"] as const;

export function getRetentionDaysForTier(tierName: string): number | null {
  return TIER_RETENTION_DAYS[tierName] ?? null;
}

export async function getRetentionDaysForProject(projectId: string): Promise<number | null> {
  if (!isFeatureEnabled(Feature.SUBSCRIPTION)) {
    return null;
  }

  const info = await getProjectBillingInfo(projectId);

  if (!info) return null;

  return getRetentionDaysForTier(info.tierName);
}

export async function applyRetentionLimits(
  projectId: string,
  parameters: Record<string, any> | undefined
): Promise<RetentionResult> {
  const retentionDays = await getRetentionDaysForProject(projectId);

  if (retentionDays === null || !parameters) {
    return { parameters, meta: {} };
  }

  const cutoff = subDays(new Date(), retentionDays);
  const clamped = clampParameters(parameters, cutoff, retentionDays);

  return {
    parameters: clamped.params,
    meta: clamped.wasClamped
      ? {
          warning: `Your current subscription tier retains only the last ${retentionDays} days of data.`,
        }
      : {},
  };
}

function clampParameters(
  parameters: Record<string, any>,
  cutoff: Date,
  retentionDays: number
): { params: Record<string, any>; wasClamped: boolean } {
  const maxHours = retentionDays * 24;

  const pastHoursResult = clampPastHours(parameters.pastHours, maxHours);
  const dateResults = TIME_PARAM_KEYS.map((key) => [key, clampDateString(parameters[key], cutoff)] as const);

  const wasClamped = pastHoursResult.clamped || dateResults.some(([, r]) => r !== null);

  return {
    params: {
      ...parameters,
      ...(pastHoursResult.clamped ? { pastHours: pastHoursResult.value } : {}),
      ...Object.fromEntries(dateResults.filter(([, v]) => v !== null)),
    },
    wasClamped,
  };
}

function clampPastHours(value: unknown, maxHours: number): { clamped: boolean; value?: string | number } {
  if (value === undefined) return { clamped: false };

  const hours = Number(value);
  if (isNaN(hours) || hours <= maxHours) return { clamped: false };

  return { clamped: true, value: typeof value === "string" ? String(maxHours) : maxHours };
}

function clampDateString(dateStr: unknown, cutoff: Date): string | null {
  if (typeof dateStr !== "string") return null;

  const hasIsoSeparator = dateStr.includes("T");
  const parsed = parseISO(hasIsoSeparator ? dateStr : dateStr.replace(" ", "T") + "Z");

  if (isNaN(parsed.getTime()) || !isBefore(parsed, cutoff)) return null;

  return hasIsoSeparator ? format(cutoff, "yyyy-MM-dd'T'HH:mm:ss.SSS") : format(cutoff, "yyyy-MM-dd HH:mm:ss.SSS");
}
