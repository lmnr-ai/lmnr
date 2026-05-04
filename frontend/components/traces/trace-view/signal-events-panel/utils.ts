import { getSignalColor } from "@/components/signals/utils";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";

/** Tailwind blue-400. Fallback hue for signals that haven't been clustered yet
 *  so the panel still feels colored rather than plain. */
const UNCLUSTERED_BASE_COLOR = "#60a5fa";

/** A signal's display color: leaf cluster's color if clustered, blue-400 otherwise. */
export function getSignalDisplayColor(signal: TraceSignal): string {
  const leaf = signal.clusterPath[signal.clusterPath.length - 1];
  return leaf ? getSignalColor(leaf.id) : UNCLUSTERED_BASE_COLOR;
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
