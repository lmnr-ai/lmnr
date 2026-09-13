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
};

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

const changelogLabel = (key: FieldKey): string => CHANGELOG_FIELDS.find((field) => field.key === key)?.label ?? key;

/** Newest first. v1 is "Created"; later rows list the fields that changed vs the previous snapshot. */
export const buildChangelog = (items: SignalVersionItem[]): ChangelogEntry[] => {
  const chronological = [...items].sort((a, b) => a.version - b.version);

  return chronological
    .map((item, index) => {
      const previous = chronological[index - 1]?.definition;
      const fields = changelogFields(previous, item.definition);
      const summary = item.version === 1 ? "Created" : fields.map(changelogLabel).join(", ");
      return {
        version: item.version,
        createdAt: item.createdAt,
        definition: item.definition,
        previous,
        summary,
      };
    })
    .reverse();
};
