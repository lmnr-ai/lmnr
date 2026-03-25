import { generateObject } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

const PREVIEW_KEY_SYSTEM_PROMPT = `You pick the most informative field from JSON structures for developer trace previews.

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
  Examples:
    "{{pattern}}"                        — top-level "pattern" field
    "{{result.text}}"                    — "text" inside "result"
    "{{[0].file}}"                       — "file" on the first array element
    "{{choices[0].message.content}}"     — deeply nested content

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

export const PreviewKeyResultSchema = z.array(
  z.object({
    fingerprint: z.string(),
    key: z.string().nullable(),
    error: z.string().nullable(),
  })
);

export type PreviewKeyResult = z.infer<typeof PreviewKeyResultSchema>;

interface SpanStructure {
  fingerprint: string;
  side: "input" | "output";
  data: unknown;
}

/**
 * Build the XML user message for the LLM call.
 */
const buildUserMessage = (structures: SpanStructure[]): string => {
  const spanElements = structures
    .map((s) => {
      const truncatedData = typeof s.data === "string" ? s.data : JSON.stringify(s.data);
      return `<span fingerprint="${escapeXml(s.fingerprint)}" side="${s.side}">\n${truncatedData}\n</span>`;
    })
    .join("\n");

  return `<structures>\n${spanElements}\n</structures>`;
};

const escapeXml = (str: string): string =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * Call the LLM (Gemini flash lite via AI SDK) with structured output
 * to pick the best preview key for each span structure.
 */
export const generatePreviewKeys = async (structures: SpanStructure[]): Promise<PreviewKeyResult> => {
  if (structures.length === 0) return [];

  const { object } = await generateObject({
    model: getLanguageModel("lite"),
    schema: PreviewKeyResultSchema,
    system: PREVIEW_KEY_SYSTEM_PROMPT,
    prompt: buildUserMessage(structures),
  });

  return object;
};
