import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod/v4";

import { getLanguageModel } from "@/lib/ai/model";

const MAX_FIELD_CHARS = 2000; // ~2KB per field before it hits the prompt

export const SampleRowSchema = z.object({
  index: z.number().optional(),
  data: z.unknown().optional(),
  metadata: z.unknown().optional(),
  target: z.unknown().optional(),
});
export type LabelFieldSampleRow = z.infer<typeof SampleRowSchema>;

const LABEL_FIELD_SYSTEM_PROMPT = `<task>
You are given up to 5 sample rows from an evaluation dataset. Each row has up to three JSON fields: \`data\` (the input), \`metadata\` (extra info), and \`target\` (the expected output). Pick ONE field path across these rows that best serves as a short, human-readable label identifying each row at a glance.
</task>

<grammar>
A field path starts with one of \`data\`, \`metadata\`, \`target\`, followed by zero or more dot-separated key segments, each optionally followed by a numeric array index in brackets. Examples: \`data\`, \`data.question\`, \`metadata.userId\`, \`data.items[0].name\`.
</grammar>

<selection_criteria>
- Consider ALL THREE sources equally: the identifying characteristic is often a specific nested field inside \`data\` (e.g. \`data.question\`, \`data.task.name\`), but may also live in \`metadata\` or \`target\`. Do not default to \`metadata\` just because it is smaller.
- Prefer a field whose value is SHORT (a few words, not a paragraph) and DISTINCT across the rows — good labels read like a title or a short question.
- Avoid opaque identifiers (UUIDs, hashes, numeric ids) unless nothing else is available.
- Avoid fields that are long prose, full JSON blobs, or arrays/objects — the path must resolve to a scalar (string, number, or boolean).
- If every sample shares the same value for a candidate field, it does not distinguish rows — prefer a field that varies.
- If no field is a good fit, return null.
</selection_criteria>

<output_format>
Return exactly one field: fieldPath, either a path string matching the grammar, or null. No prose.
</output_format>`;

export const LabelFieldResultSchema = z.object({
  fieldPath: z
    .string()
    .nullable()
    .describe("Dot-path into data/metadata/target that best labels each row, or null if none fits"),
});

function truncate(value: unknown): string {
  const str = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return str.length > MAX_FIELD_CHARS ? `${str.slice(0, MAX_FIELD_CHARS)}…` : str;
}

function buildUserMessage(sampleRows: LabelFieldSampleRow[]): string {
  const rowElements = sampleRows
    .map(
      (row, i) => `<row index="${row.index ?? i}">
<data>${truncate(row.data)}</data>
<metadata>${truncate(row.metadata)}</metadata>
<target>${truncate(row.target)}</target>
</row>`
    )
    .join("\n");

  return `<rows count="${sampleRows.length}">
${rowElements}
</rows>`;
}

/** Single LLM call: pick the field path, or null. Throws on provider/network failure — caller decides the fallback. */
export async function generateLabelFieldPath(sampleRows: LabelFieldSampleRow[]): Promise<string | null> {
  const { object } = await observe({ name: "label-field:generate", input: { sampleCount: sampleRows.length } }, () =>
    generateObject({
      model: getLanguageModel("small"),
      schema: LabelFieldResultSchema,
      system: LABEL_FIELD_SYSTEM_PROMPT,
      prompt: buildUserMessage(sampleRows),
      abortSignal: AbortSignal.timeout(8000),
      experimental_telemetry: {
        isEnabled: true,
        tracer: getTracer(),
      },
    })
  );
  return object.fieldPath;
}
