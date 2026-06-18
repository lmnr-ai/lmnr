import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { getClusterColorById } from "@/lib/clusters/colors";

/** The panel's accent is the active signal's leaf-cluster color (the same color
 *  shown in the cluster list / stacked chart), falling back to the platform
 *  primary for unclustered signals. */
export function getSignalAccentColor(signal?: TraceSignal): string {
  const leaf = signal?.leafCluster;
  return leaf ? getClusterColorById(leaf.id) : "var(--color-primary)";
}

export function schemaFieldsToStructuredOutput(fields: TraceSignal["schemaFields"]): {
  type: string;
  properties: Record<string, { type: string; description: string }>;
} {
  return fields.reduce(
    (acc, f) => {
      if (f.name.trim()) {
        acc.properties[f.name] = { type: f.type, description: f.description ?? "" };
      }
      return acc;
    },
    { type: "object", properties: {} } as {
      type: string;
      properties: Record<string, { type: string; description: string }>;
    }
  );
}
