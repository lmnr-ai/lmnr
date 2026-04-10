import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateText } from "ai";

import { getLanguageModel } from "@/lib/ai/model";

import { flattenPaths } from "./utils.ts";

const PREVIEW_KEY_SYSTEM_PROMPT = `Pick fields from a schema to build a short Mustache preview template. One template per structure.

Array access: use .0. for nested arrays. When root is an array (paths start with []), wrap with {{#.}}...{{/.}} and use inner paths.

Rules:
- Pick 1-3 content fields. {{{ }}} for long text strings. **bold** for short labels.
- null ONLY if every field is [meta]/[id] or empty.

Field classification:
- [meta] fields (skip): id, status, type, mode, version, role, model, usage, timestamp, duration, finish_reason, token_count, index, logprobs, created, object, system_fingerprint.
- [id] fields (skip when siblings have content): name, action, function, method, command, tool. These identify what operation runs and are shown in the span header. Never include them in the preview when other content fields exist.
- Content fields (prefer): content, text, thinking, result, output, message, answer, query, description, summary, url, path. When multiple exist, pick the most descriptive one.

Decision order:
1. Content field present → {{{field}}}
2. [id] field present + sibling fields under a nested key (args/arguments/input/params/body or any sub-object) → pick the single most descriptive short string leaf from those siblings as {{{nested.leaf}}}. Never use **bold** labels for these — just the raw value. If the only siblings are [meta] or null → null.
3. [id] field is the only non-meta field → null
4. Label + value pair (no [id] field present) → **{{label}}** — {{value}}
5. Array with name+value items → {{#arr}}\n- **{{name}}**: {{value}}\n{{/arr}}
6. Deeply nested leaf → {{{path.0.to.0.field}}}
7. All [meta]/[id]/empty → null

Examples:
- "choices[].message.content: string" → {{{choices.0.message.content}}}
- "[].output[].content[].text: string" → {{#.}}{{{output.0.content.0.text}}}{{/.}}
- "name: string [id]" + "input.query: string" + "input.max_results: number" → {{{input.query}}}
- "action: string [id]" + "params.file_name: string" + "params.old_str: string" → {{{params.file_name}}}
- "action: string [id]" + "params.keys: string" → {{{params.keys}}}
- "action: string [id]" + "params.index: number [meta]" → null
- "name: string [id]" + "arguments.command: string" → {{{arguments.command}}}
- "score: number" + "grade: string" → **{{grade}}** — {{score}}
- "id: string [meta]" + "name: string" + "type: string [meta]" → **{{name}}**
- "name: string [meta]" + "id: string [meta]" + "type: string [meta]" → null`;

export type PreviewKeyResult = Array<string | null>;

interface SpanStructure {
  data: unknown;
}

const buildUserMessage = (structures: SpanStructure[]): string => {
  const spanElements = structures
    .map((s, i) => {
      const paths = flattenPaths(s.data);
      return `<span index="${i}">\n${paths.join("\n")}\n</span>`;
    })
    .join("\n");

  return `<structures count="${structures.length}">\n${spanElements}\n</structures>\nReturn exactly ${structures.length} templates as a JSON array of strings (or null). No explanation.`;
};

const parsePreviewKeysResponse = (text: string, expectedLength: number): PreviewKeyResult => {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return new Array(expectedLength).fill(null);

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return new Array(expectedLength).fill(null);
    return parsed.map((v: unknown) => (typeof v === "string" ? v : null));
  } catch {
    return new Array(expectedLength).fill(null);
  }
};

export const generatePreviewKeys = async (structures: SpanStructure[]): Promise<PreviewKeyResult> => {
  if (structures.length === 0) return [];

  try {
    const { text } = await observe({ name: "generatePreviewKeys" }, async () =>
      generateText({
        model: getLanguageModel("lite"),
        system: PREVIEW_KEY_SYSTEM_PROMPT,
        prompt: buildUserMessage(structures),
        maxRetries: 0,
        temperature: 0,
        abortSignal: AbortSignal.timeout(5000),
        experimental_telemetry: {
          isEnabled: true,
          tracer: getTracer(),
        },
      })
    );

    return parsePreviewKeysResponse(text, structures.length);
  } catch {
    return new Array(structures.length).fill(null);
  }
};
