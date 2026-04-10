import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateText } from "ai";

import { getLanguageModel } from "@/lib/ai/model";

import { flattenPaths } from "./utils.ts";

const PREVIEW_KEY_SYSTEM_PROMPT = `Pick fields from a schema to build a short Mustache preview template. One template per structure.

Array access: use .0. for nested arrays. When root is an array (paths start with []), wrap with {{#.}}...{{/.}} and use inner paths.

Rules:
- Pick 1-3 content fields. Prefer string fields without [meta].
- {{{ }}} for long text strings. **bold** for labels/names.
- null ONLY if every field is [meta] or empty.
- Skip [meta] fields: id, status, type, mode, version, role, model, usage, timestamp, duration, finish_reason, token_count, index, logprobs, created, object, system_fingerprint.

Decision order:
1. Single text field (content, text, result, output, message, answer) → {{{field}}}
2. Label + value pair → **{{label}}** — {{value}}
3. Function/tool call (has "name" + "args"/"arguments"/"input") → {{{best_arg}}} — pick the single most descriptive short string argument (ignore "name", it is shown elsewhere). The preview must be concise (one line).
4. "name" as only non-meta field → null
5. Array with name+value items → {{#arr}}\n- **{{name}}**: {{value}}\n{{/arr}}
6. Deeply nested leaf → {{{path.0.to.0.field}}}
7. All [meta]/empty → null

Examples:
- "score: number" + "grade: string" → **{{grade}}** — {{score}}
- "id: string [meta]" + "name: string" + "type: string [meta]" → **{{name}}**
- "name: string" + "input.query: string" + "input.max_results: number" → {{{input.query}}}
- "name: string" + "input.file_path: string" + "input.limit: number" → {{{input.file_path}}}
- "name: string" + "arguments.command: string" → {{{arguments.command}}}
- "name: string [meta]" + "id: string [meta]" + "type: string [meta]" → null
- "[].content.parts[].function_call.name: string" + "[].content.parts[].function_call.args.city: string" → {{#.}}**{{content.parts.0.function_call.name}}**{{/.}}
- "items[].name: string" + "items[].value: string" → {{#items}}\n- **{{name}}**: {{value}}\n{{/items}}
- "choices[].message.content: string" → {{{choices.0.message.content}}}
- "[].output[].content[].text: string" → {{#.}}{{{output.0.content.0.text}}}{{/.}}
- "data.spans[].output[].content[].text: string" → {{{data.spans.0.output.0.content.0.text}}}
- "id: string [meta]" + "status: string [meta]" + "version: string [meta]" → null`;

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
