import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

const PREVIEW_KEY_SYSTEM_PROMPT = `You compose concise Mustache templates to preview JSON structures in a developer trace list.

Context:
- You are helping an observability platform show span previews in a trace list.
- Each span has output JSON data. You compose a Mustache template that renders a short, informative preview.
- Structures are numbered starting from 0. Return a template for each index.
- All string fields within the JSON have already been deep-parsed, so nested objects are real objects, not JSON strings.
- The rendered output is displayed as markdown text in a UI card.

Mustache syntax reference:
- Variable: {{field}} or {{nested.field}}
- Array index: {{items.0.name}} (dot notation, NOT brackets)
- Section (iterate array): {{#items}}...{{/items}}
- Unescaped (for markdown/long text): {{{field}}}

Output format:
- For a single text/content field: {{{content}}} or {{{text}}}
- For summary fields: **{{label}}** — {{value}}
- For arrays: {{#items}}\n- **{{name}}**: {{value}}\n{{/items}} (each item on its own line)
- Use {{{ }}} (triple braces) for fields containing markdown or long text.

Guidelines:
- Show *results and values*, not just *names and labels*. A name like "Throughput Test" is a label; a value like grade "A" or score 9.2 is a result.
- Prefer top-level summary fields (grade, score, total, target) over iterating arrays of details.
- When iterating arrays, place content on its own line between opening/closing section tags.
- Prefer 1-3 key fields. Keep templates concise — readable summary, not a dump.
- For large/nested objects, show only top-level summaries or the first item's key metrics.
- Use markdown: **bold** for labels, "- " for list items, {{{ }}} for markdown/long text.

Rules:
- Skip metadata fields: status, type, mode, count, timestamp, duration,
  id, version, role, finish_reason, model, token_count, usage, index, logprobs.
- Prefer the main result, generated text, or most human-readable content.
- Return null when no good field exists (all metadata/numeric, empty, IDs/hashes only).`;

const PreviewKeyResultSchema = z.array(z.string().nullable());

export type PreviewKeyResult = z.infer<typeof PreviewKeyResultSchema>;

interface SpanStructure {
  data: unknown;
}

/**
 * Build the XML user message for the LLM call.
 * Each structure is tagged with its positional index (0-based).
 */
const buildUserMessage = (structures: SpanStructure[]): string => {
  const spanElements = structures
    .map((s, i) => {
      const truncatedData = typeof s.data === "string" ? s.data : JSON.stringify(s.data);
      return `<span index="${i}">\n${truncatedData}\n</span>`;
    })
    .join("\n");

  return `<structures>\n${spanElements}\n</structures>`;
};

/**
 * Call the LLM (Gemini flash lite via AI SDK) with structured output
 * to pick the best preview key for each span structure.
 */
export const generatePreviewKeys = async (structures: SpanStructure[]): Promise<PreviewKeyResult> => {
  if (structures.length === 0) return [];

  const { object } = await observe({ name: "generatePreviewKeys" }, async () =>
    generateObject({
      model: getLanguageModel("lite"),
      schema: PreviewKeyResultSchema,
      system: PREVIEW_KEY_SYSTEM_PROMPT,
      prompt: buildUserMessage(structures),
      experimental_telemetry: {
        isEnabled: true,
        tracer: getTracer(),
      },
    })
  );

  return object;
};
