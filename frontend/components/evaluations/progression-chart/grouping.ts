import { spacedPalette } from "@/lib/colors";

import { type ProgressionPoint } from "./shared";

export const NONE_GROUP = "(none)";
const MAX_KEY_DEPTH = 3;

type Scalar = string | number | boolean;

// Flattens nested objects into dot paths; arrays and nulls aren't groupable.
function flattenScalars(value: unknown, prefix: string, depth: number, out: Record<string, Scalar>) {
  if (value === null || value === undefined || Array.isArray(value)) return;
  if (typeof value === "object") {
    if (depth >= MAX_KEY_DEPTH) return;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flattenScalars(v, prefix ? `${prefix}.${k}` : k, depth + 1, out);
    }
    return;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out[prefix] = value;
  }
}

export function flattenMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  if (metadata) flattenScalars(metadata, "", 0, out);
  return out;
}

export interface MetadataKeyInfo {
  key: string;
  distinctValues: number;
}

// Every groupable key with how many distinct values it takes (runs missing it count as `(none)`), sorted by key.
export function describeMetadataKeys(points: { metadata?: Record<string, unknown> | null }[]): MetadataKeyInfo[] {
  const valuesByKey = new Map<string, Set<string>>();
  const runsByKey = new Map<string, number>();
  for (const p of points) {
    for (const [key, value] of Object.entries(flattenMetadata(p.metadata))) {
      valuesByKey.set(key, (valuesByKey.get(key) ?? new Set<string>()).add(String(value)));
      runsByKey.set(key, (runsByKey.get(key) ?? 0) + 1);
    }
  }
  return Array.from(valuesByKey.entries())
    .map(([key, values]) => ({ key, distinctValues: values.size + (runsByKey.get(key)! < points.length ? 1 : 0) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export interface GroupInfo {
  label: string;
  color: string;
}

export interface Grouping {
  groups: GroupInfo[];
  groupByEvalId: Record<string, string>;
}

export function buildGrouping(points: ProgressionPoint[], key: string): Grouping {
  const groupByEvalId: Record<string, string> = {};
  const labels = new Set<string>();
  for (const p of points) {
    const value = flattenMetadata(p.metadata)[key];
    const label = value === undefined ? NONE_GROUP : String(value);
    groupByEvalId[p.evaluationId] = label;
    labels.add(label);
  }

  // Colors follow label order, not run count, so they stay put as runs arrive.
  const sortedLabels = Array.from(labels).sort((a, b) =>
    a === NONE_GROUP ? 1 : b === NONE_GROUP ? -1 : a.localeCompare(b, undefined, { numeric: true })
  );
  const colors = spacedPalette(sortedLabels.length);
  return { groups: sortedLabels.map((label, i) => ({ label, color: colors[i] })), groupByEvalId };
}
