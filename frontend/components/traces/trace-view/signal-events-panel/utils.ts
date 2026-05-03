import { type TraceSignal } from "@/components/traces/trace-view/store/base";

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
