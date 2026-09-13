import { type TraceSignal } from "@/components/traces/trace-view/store/base";

/** The worst event's severity. With several events (a per-span signal) the header
 *  speaks for the whole card, and the card is as bad as its worst event. */
export const worstSeverity = (signal: TraceSignal) =>
  signal.events.reduce((worst, e) => Math.max(worst, e.severity), 0);

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
