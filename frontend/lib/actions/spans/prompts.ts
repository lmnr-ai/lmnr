import { generateObject } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

const SYSTEM_PROMPT = `You pick the most informative field from JSON structures for developer trace previews.

Context:
- You are helping an observability platform show span previews in a trace list.
- Each span has input/output JSON data. We want to show ONE key field as a short preview.
- The "side" attribute tells you whether you are looking at the span's input or output.
  Pick the most informative field from that side's structure.
- schema_fingerprint is a pre-computed unique identifier for a JSON structure shape,
  formatted as "span_name:{sorted_keys_with_types}".
  Example: "Grep:{output_mode:string,pattern:string,type:string}" means a span named
  "Grep" whose data has three fields.
- mustache_key is an access path to extract a value from the JSON.
  IMPORTANT: Use dot notation for array indices, NOT bracket notation.
  Examples:
    "{{pattern}}"                        — top-level "pattern" field
    "{{result.text}}"                    — "text" inside "result"
    "{{0.file}}"                         — "file" on the first array element
    "{{choices.0.message.content}}"      — deeply nested content

Rules:
- Pick the single most human-readable, descriptive string field per structure.
- For tool inputs: pick the field showing what the tool operated on
  (file path, query, command, search pattern, URL, prompt).
- For LLM outputs: pick the field containing the model's generated text.
- Never pick metadata fields: status, type, mode, count, timestamp, duration,
  id, version, role, finish_reason, model, token_count, usage, index, logprobs.

Return errors (key: null) when:
- All fields are metadata/numeric with no meaningful text content.
- Structure is empty or has no extractable fields.
- All string values appear to be IDs or hashes, not human-readable content.
- You are not confident in any pick.`;

const ResultSchema = z.array(
  z.object({
    fingerprint: z.string(),
    key: z.string().nullable(),
    error: z.string().nullable(),
  })
);

export type ReaderKeyResult = z.infer<typeof ResultSchema>[number];

export interface SpanStructure {
  fingerprint: string;
  side: "input" | "output";
  payload: string;
}

function buildUserMessage(structures: SpanStructure[]): string {
  const spans = structures
    .map((s) => `<span fingerprint="${s.fingerprint}" side="${s.side}">\n${s.payload}\n</span>`)
    .join("\n\n");

  return `<structures>\n${spans}\n</structures>`;
}

/**
 * Call the LLM to pick the best mustache key for each structure.
 * Batches up to `maxBatchSize` structures per call.
 */
export async function generateReaderKeys(
  structures: SpanStructure[],
  maxBatchSize: number = 10
): Promise<ReaderKeyResult[]> {
  const results: ReaderKeyResult[] = [];

  for (let i = 0; i < structures.length; i += maxBatchSize) {
    const batch = structures.slice(i, i + maxBatchSize);
    const userMessage = buildUserMessage(batch);

    const { object } = await generateObject({
      model: getLanguageModel("lite"),
      schema: ResultSchema,
      system: SYSTEM_PROMPT,
      prompt: userMessage,
    });

    results.push(...object);
  }

  return results;
}
