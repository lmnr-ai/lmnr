export type SignalMode = "batch" | "realtime";

/** Live-trace snapshot. Key names must match the Rust `SignalDefinition`. */
export type SignalDefinition = {
  name: string;
  prompt: string;
  structuredOutputSchema: Record<string, unknown>;
  /** Stored `signal_triggers.value` (Filter[]), not the CLI tagged enum. */
  trigger: unknown[];
  filters: unknown[];
  mode: SignalMode;
  sampleRate: number | null;
  disabled: boolean;
  /** Both `null` = env-var routing. Cloud signals stay `null`. */
  llmProfileId: string | null;
  llmModel: string | null;
};

export type SignalVersion = {
  version: number;
  definition: SignalDefinition;
  createdAt: string;
};

/** Matches 0109 / CLI create when a signal has no trigger row. */
const DEFAULT_VERSION_TRIGGER: unknown[] = [{ column: "root_span_finished", operator: "eq", value: "true" }];

export const modeFromI16 = (mode: number): SignalMode => (mode === 0 ? "batch" : "realtime");

export const buildSignalDefinition = ({
  name,
  prompt,
  structuredOutputSchema,
  trigger,
  filters,
  mode,
  sampleRate,
  disabled,
  llmProfileId,
  llmModel,
}: {
  name: string;
  prompt: string;
  structuredOutputSchema: Record<string, unknown>;
  trigger?: unknown;
  filters?: unknown;
  mode?: number | SignalMode;
  sampleRate?: number | null;
  disabled?: boolean;
  llmProfileId?: string | null;
  llmModel?: string | null;
}): SignalDefinition => ({
  name,
  prompt,
  structuredOutputSchema,
  trigger: Array.isArray(trigger) ? trigger : DEFAULT_VERSION_TRIGGER,
  filters: Array.isArray(filters) ? filters : [],
  mode: typeof mode === "number" ? modeFromI16(mode) : (mode ?? "realtime"),
  sampleRate: sampleRate ?? null,
  disabled: disabled ?? false,
  llmProfileId: llmProfileId ?? null,
  llmModel: llmModel ?? null,
});

/** Sorted object keys so filter-array sort is stable across key-order-only diffs. */
export const canonicalJson = (value: unknown): string => {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      return `[${value.map(canonicalJson).join(",")}]`;
    }
    const keys = Object.keys(value as object).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const byCanonicalJson = (a: unknown, b: unknown): number => {
  const left = canonicalJson(a);
  const right = canonicalJson(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

/** AND-list of filters: order is not semantic; nested `value` arrays (span names) are sets. */
const sortFilterList = (list: unknown[]): unknown[] => {
  const normalized = list.map((item) => {
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      Array.isArray((item as { value?: unknown }).value)
    ) {
      return { ...(item as object), value: [...(item as { value: unknown[] }).value].sort(byCanonicalJson) };
    }
    return item;
  });
  return [...normalized].sort(byCanonicalJson);
};

// `required` is a set the drawer rebuilds from `properties` — which jsonb
// stores key-sorted — so its order flips without the schema changing. Missing
// ops fields compare as their stored-row defaults.
export const comparable = (definition: SignalDefinition) => {
  const structuredOutputSchema = { ...definition.structuredOutputSchema };
  const { required } = structuredOutputSchema;
  if (Array.isArray(required)) {
    structuredOutputSchema.required = [...required].sort();
  }
  return {
    name: definition.name ?? "",
    prompt: definition.prompt,
    structuredOutputSchema,
    trigger: sortFilterList(Array.isArray(definition.trigger) ? definition.trigger : []),
    filters: sortFilterList(Array.isArray(definition.filters) ? definition.filters : []),
    mode: definition.mode === "batch" ? "batch" : "realtime",
    sampleRate: definition.sampleRate ?? null,
    disabled: definition.disabled ?? false,
    llmProfileId: definition.llmProfileId ?? null,
    llmModel: definition.llmModel ?? null,
  };
};
