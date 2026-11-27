export type SignalVersionItem = {
  version: number;
  createdAt: string;
  definition: Record<string, unknown>;
};

export type ChangelogEntry = {
  version: number;
  createdAt: string;
  definition: Record<string, unknown>;
  previous?: Record<string, unknown>;
  summary: string;
  /** Every field on v1; only the fields that changed afterwards. */
  fields: ChangedField[];
};

export type ChangedField = { key: string; label: string; before?: string; after: string };

const CHANGELOG_FIELDS = [
  { key: "name", label: "Name" },
  { key: "prompt", label: "Prompt" },
  { key: "structuredOutputSchema", label: "Schema" },
  { key: "trigger", label: "Trigger" },
  { key: "filters", label: "Filters" },
  { key: "mode", label: "Mode" },
  { key: "sampleRate", label: "Sample rate" },
  { key: "disabled", label: "Status" },
  { key: "llm", label: "LLM" },
] as const;

type FieldKey = (typeof CHANGELOG_FIELDS)[number]["key"];

const pick = (definition: Record<string, unknown>, key: FieldKey): unknown => {
  if (key === "llm") {
    return { llmProfileId: definition.llmProfileId ?? null, llmModel: definition.llmModel ?? null };
  }
  return definition[key];
};

const changelogFields = (
  previous: Record<string, unknown> | undefined,
  current: Record<string, unknown>
): FieldKey[] => {
  if (!previous) return CHANGELOG_FIELDS.map((field) => field.key);
  return CHANGELOG_FIELDS.filter(
    (field) => JSON.stringify(pick(previous, field.key)) !== JSON.stringify(pick(current, field.key))
  ).map((field) => field.key);
};

// The instruction reads best as raw text; everything else as pretty JSON.
const fieldText = (definition: Record<string, unknown>, key: FieldKey): string => {
  const value = pick(definition, key);
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? null, null, 2);
};

const changelogLabel = (key: FieldKey): string => CHANGELOG_FIELDS.find((field) => field.key === key)?.label ?? key;

/** Newest first. v1 is "Initial version"; later rows list the fields that changed vs the previous snapshot. */
export const buildChangelog = (items: SignalVersionItem[]): ChangelogEntry[] => {
  const chronological = [...items].sort((a, b) => a.version - b.version);

  return chronological
    .map((item, index) => {
      const previous = chronological[index - 1]?.definition;
      const fields = changelogFields(previous, item.definition);
      const labels = fields.map(changelogLabel);
      const summary = !previous
        ? "Initial version"
        : labels.length === 0
          ? "No changes"
          : `${labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0]} changed`;
      return {
        version: item.version,
        createdAt: item.createdAt,
        definition: item.definition,
        previous,
        summary,
        fields: fields.map((key) => ({
          key,
          label: changelogLabel(key),
          before: previous ? fieldText(previous, key) : undefined,
          after: fieldText(item.definition, key),
        })),
      };
    })
    .reverse();
};
