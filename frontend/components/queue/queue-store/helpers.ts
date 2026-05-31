import { isEqual } from "lodash";

import { type QueueItemState } from "@/lib/actions/queue";
import { type LabelingQueueItem, type QueueProgress } from "@/lib/queue/types";
import { tryParseJson } from "@/lib/utils";

export { EMPTY_PROGRESS, type QueueProgress } from "@/lib/queue/types";

export type QueueIoState = false | "list" | "push-all" | "push-one" | "remove" | "save";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Number of items kept in memory on each side of the focused index.
 * Window size is therefore `2 * WINDOW_RADIUS + 1` (default 5). Items
 * outside the window are evicted on every nav so a 10k-item queue never
 * holds more than 5 full payloads at once. Kept as a top-level constant
 * (not a store field) because changing it at runtime would invalidate
 * the eviction invariants without simplifying any caller.
 */
export const WINDOW_RADIUS = 2;

export const getEffectiveTarget = (item: LabelingQueueItem | undefined): unknown => {
  if (!item) return {};
  if (item.edit && item.edit.length > 0) {
    return tryParseJson(item.edit) ?? item.payload?.target ?? {};
  }
  return item.payload?.target ?? {};
};

export const isDirty = (item: LabelingQueueItem | undefined): boolean => {
  if (!item) return false;
  if (!item.edit || item.edit.length === 0) return false;
  const parsed = tryParseJson(item.edit) ?? null;
  const original = item.payload?.target ?? null;
  return !isEqual(parsed, original);
};

export const isApproved = (item: LabelingQueueItem | undefined): boolean => !!item && item.status === 1;

export const deriveItemState = (item: LabelingQueueItem): QueueItemState => {
  if (item.status === 1) return "approved";
  return isDirty(item) ? "modified" : "new";
};

export interface TargetSchemaDrift {
  targetIsObject: boolean;
  targetType: string;
  extras: string[];
  hasDrift: boolean;
}

export const getTargetSchemaDrift = (target: unknown, schemaKeys: readonly string[]): TargetSchemaDrift => {
  const targetIsObject = !!target && typeof target === "object" && !Array.isArray(target);
  const targetType = Array.isArray(target) ? "array" : target === null ? "null" : typeof target;
  if (schemaKeys.length === 0) {
    return { targetIsObject, targetType, extras: [], hasDrift: false };
  }
  if (!targetIsObject) {
    return { targetIsObject, targetType, extras: [], hasDrift: true };
  }
  const schemaSet = new Set(schemaKeys);
  const extras = Object.keys(target as Record<string, unknown>).filter((k) => !schemaSet.has(k));
  return { targetIsObject, targetType, extras, hasDrift: extras.length > 0 };
};

export const computeProgress = (states: Record<string, QueueItemState>): QueueProgress => {
  let n = 0;
  let m = 0;
  let a = 0;
  for (const s of Object.values(states)) {
    if (s === "new") n++;
    else if (s === "modified") m++;
    else if (s === "approved") a++;
  }
  return { total: n + m + a, new: n, modified: m, approved: a };
};
