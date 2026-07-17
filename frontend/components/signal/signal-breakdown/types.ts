import { type Filter } from "@/lib/actions/common/filters";

/**
 * A breakdown dimension is the axis the Signals list + graph group events by.
 * `clusters` is the original behaviour; the rest were generalised on top
 * (LAM: clusters-table → generic buckets). `enum` carries the payload field it
 * groups on, so each enum field in the signal schema is its own dimension.
 */
export type BreakdownDimension =
  | { kind: "clusters" }
  | { kind: "severity" }
  | { kind: "agent" }
  | { kind: "enum"; field: string };

/** Stable string key for a dimension — used as the dropdown value + state key. */
export const dimensionKey = (d: BreakdownDimension): string => (d.kind === "enum" ? `enum:${d.field}` : d.kind);

/** The icon a breakdown node renders, discriminated by dimension family. */
export type BreakdownIcon =
  | { type: "cluster"; variant: "box" | "boxes" | "circle-dashed"; color: string; isSelected?: boolean }
  | { type: "severity"; severity: number }
  | { type: "agent"; color: string; isVersion?: boolean }
  | { type: "dot"; filled: boolean; color: string };

/**
 * One row in the breakdown list / one series in the stacked graph. Shape is
 * dimension-agnostic on purpose — the dumb UI never learns which dimension it
 * is rendering; the per-dimension hook produces these.
 */
export interface BreakdownNode {
  id: string;
  name: string;
  parentId: string | null;
  icon: BreakdownIcon;
  /** Colour for the graph series + the list proportion bar. */
  color: string;
  children: BreakdownNode[];
  /** All-time count for this bucket (hover card denominator); range count comes from stats. */
  totalCount?: number;
  createdAt?: string;
  updatedAt?: string;
  /** Extra dimension-specific hover rows, e.g. "3 versions" for an agent. */
  hoverStats?: { label: string; value: string }[];
  /** Catch-all bucket (Unclustered / Unversioned / None) — rendered in a
   * separate divided section at the bottom of the list. */
  isCatchAll?: boolean;
}

/**
 * The events-table filter a selected node contributes. Clusters use the legacy
 * cluster-scoped params; other dimensions attach a standard `Filter`. `agent`
 * needs a server-side join, so it rides its own param rather than a payload filter.
 */
export type EventsFilterContribution =
  | { kind: "cluster"; clusterId: string }
  | { kind: "unclustered" }
  | { kind: "filter"; filter: Filter }
  // versionHashes = null → the "unversioned" bucket (events whose trace has no
  // version_hash); a non-empty list → filter events to any of those versions
  // (one entry for a version node, an agent's whole set for an agent node).
  | { kind: "agentVersion"; versionHashes: string[] | null }
  | { kind: "none" };

/** A single time-series point, generic over the bucket id (was `cluster_id`). */
export interface BreakdownStatsPoint {
  bucketId: string;
  timestamp: string;
  count: number;
}

/** Sentinel bucket ids for the "no value" catch-alls (mirror UNCLUSTERED_ID). */
export const UNVERSIONED_ID = "__unversioned__";
export const ENUM_NONE_ID = "__none__";
