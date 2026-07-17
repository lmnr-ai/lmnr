import { type SchemaField } from "@/components/signals/utils";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { Operator } from "@/lib/actions/common/operators";
import { type AgentBucket, type BreakdownStatsPoint } from "@/lib/actions/signal-breakdown";
import { getClusterColorById, UNCLUSTERED_COLOR } from "@/lib/clusters/colors";

import { type ClusterNode } from "../clusters-section/utils";
import { type FlatBreakdownNode } from "./tree";
import {
  type BreakdownDimension,
  type BreakdownNode,
  dimensionKey,
  ENUM_NONE_ID,
  type EventsFilterContribution,
  UNVERSIONED_ID,
} from "./types";

// --- Dimension catalogue (what the dropdown offers) ---

export interface DimensionOption {
  key: string;
  label: string;
  dimension: BreakdownDimension;
}

/** The dropdown list: clusters, severity, agent, then one option per enum field. */
export function availableDimensions(schemaFields: SchemaField[]): DimensionOption[] {
  const base: DimensionOption[] = [
    { key: "clusters", label: "Event clusters", dimension: { kind: "clusters" } },
    { key: "severity", label: "Severity", dimension: { kind: "severity" } },
    { key: "agent", label: "Agent version", dimension: { kind: "agent" } },
  ];
  const enums = schemaFields
    .filter((f) => f.type === "enum" && f.name.trim().length > 0)
    .map<DimensionOption>((f) => ({
      key: dimensionKey({ kind: "enum", field: f.name }),
      label: f.name,
      dimension: { kind: "enum", field: f.name },
    }));
  return [...base, ...enums];
}

// --- Severity ---

const SEVERITY_LEVELS = [
  { id: "2", name: "Critical", severity: 2, color: "#f87171" },
  { id: "1", name: "Warning", severity: 1, color: "#fb923c" },
  { id: "0", name: "Info", severity: 0, color: "var(--color-muted-foreground)" },
] as const;

export function buildSeverityNodes(): FlatBreakdownNode[] {
  return SEVERITY_LEVELS.map((s) => ({
    id: s.id,
    name: s.name,
    parentId: null,
    color: s.color,
    icon: { type: "severity", severity: s.severity },
  }));
}

// --- Enum payload field ---

export function buildEnumNodes(field: string, schemaField: SchemaField | undefined): FlatBreakdownNode[] {
  const values = schemaField?.enumValues ?? [];
  const nodes: FlatBreakdownNode[] = values.map((v) => ({
    id: v,
    name: v,
    parentId: null,
    color: getClusterColorById(`enum:${field}:${v}`),
    icon: { type: "dot", filled: true, color: getClusterColorById(`enum:${field}:${v}`) },
  }));
  // Absent-field catch-all (id matches the getEnumStats "__none__" coalesce).
  nodes.push({
    id: ENUM_NONE_ID,
    name: "None",
    parentId: null,
    color: UNCLUSTERED_COLOR,
    icon: { type: "dot", filled: false, color: UNCLUSTERED_COLOR },
    isCatchAll: true,
  });
  return nodes;
}

// --- Agent (tree: agent → versions, + unversioned) ---

export function buildAgentNodes(buckets: AgentBucket[]): FlatBreakdownNode[] {
  const nodes: FlatBreakdownNode[] = [];
  for (const a of buckets) {
    nodes.push({
      id: a.agentId,
      name: a.name,
      parentId: null,
      color: getClusterColorById(a.agentId),
      icon: { type: "agent", color: getClusterColorById(a.agentId) },
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      hoverStats: [{ label: "versions", value: String(a.versions.length) }],
    });
    a.versions.forEach((v, i) => {
      // Colour each version distinctly (by its own hash) so sibling versions of
      // one agent are visually separable in the list + stacked chart.
      const versionColor = getClusterColorById(v.versionHash);
      nodes.push({
        id: v.versionHash,
        name: `Version ${a.versions.length - i}`,
        parentId: a.agentId,
        color: versionColor,
        icon: { type: "agent", color: versionColor, isVersion: true },
        createdAt: v.createdAt,
      });
    });
  }
  nodes.push({
    id: UNVERSIONED_ID,
    name: "Unversioned",
    parentId: null,
    color: UNCLUSTERED_COLOR,
    // Same dashed-circle glyph as "Unclustered" — it's the agent catch-all.
    icon: { type: "cluster", variant: "circle-dashed", color: UNCLUSTERED_COLOR },
    isCatchAll: true,
  });
  return nodes;
}

/**
 * Agent stats arrive keyed by version_hash (+ the unversioned sentinel). Roll
 * them up so every agent node also has a range count = Σ its versions — the
 * equivalent of the ancestor counts clusters get free from `ARRAY JOIN`.
 */
export function rollupAgentStats(points: BreakdownStatsPoint[], buckets: AgentBucket[]): BreakdownStatsPoint[] {
  const versionToAgent = new Map<string, string>();
  for (const a of buckets) for (const v of a.versions) versionToAgent.set(v.versionHash, a.agentId);

  const rolled: BreakdownStatsPoint[] = [...points];
  for (const p of points) {
    const agentId = versionToAgent.get(p.bucketId);
    if (agentId) rolled.push({ bucketId: agentId, timestamp: p.timestamp, count: p.count });
  }
  return rolled;
}

// --- Clusters (map the store's ClusterNode tree onto the agnostic shape) ---

export function clusterNodesToBreakdown(nodes: ClusterNode[]): BreakdownNode[] {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name,
    parentId: n.parentId,
    color: n.id === UNCLUSTERED_ID ? UNCLUSTERED_COLOR : getClusterColorById(n.id),
    icon:
      n.id === UNCLUSTERED_ID
        ? { type: "cluster", variant: "circle-dashed", color: UNCLUSTERED_COLOR }
        : {
            type: "cluster",
            variant: n.children.length > 0 ? "boxes" : "box",
            color: getClusterColorById(n.id),
          },
    children: clusterNodesToBreakdown(n.children),
    totalCount: n.numEvents,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }));
}

// --- Events-table filter derivation (pure; the single source of truth) ---

/**
 * The events-table filter for the current non-cluster selection, derived from
 * primitive state (so the events table can compute it without the node tree).
 * Clusters are NOT handled here — the events table keeps their legacy
 * cluster-id URL path.
 */
export function deriveBreakdownEventsFilter(
  breakdownBy: BreakdownDimension,
  id: string | null,
  agentBuckets: AgentBucket[]
): EventsFilterContribution {
  if (!id) return { kind: "none" };
  switch (breakdownBy.kind) {
    case "severity":
      return { kind: "filter", filter: { column: "severity", operator: Operator.Eq, value: id } };
    case "enum":
      // Absent-field ("None") isn't expressible as a value:"" Filter (schema
      // rejects empty) — display-only for now. TODO: field-absent predicate.
      if (id === ENUM_NONE_ID) return { kind: "none" };
      return {
        kind: "filter",
        filter: { column: `payload.${breakdownBy.field}`, operator: Operator.Eq, value: id, dataType: "string" },
      };
    case "agent": {
      if (id === UNVERSIONED_ID) return { kind: "agentVersion", versionHashes: null };
      const agent = agentBuckets.find((a) => a.agentId === id);
      if (agent) return { kind: "agentVersion", versionHashes: agent.versions.map((v) => v.versionHash) };
      return { kind: "agentVersion", versionHashes: [id] }; // a specific version hash
    }
    default:
      return { kind: "none" };
  }
}
