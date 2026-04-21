import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateText } from "ai";

import { getLanguageModel } from "@/lib/ai/model";

import { flattenPaths } from "./utils.ts";

const PREVIEW_KEY_SYSTEM_PROMPT = `Pick fields from a schema to build a short Mustache preview template. One template per structure.

Most inputs are tool-use blocks (Anthropic: {type, id, name, input.*}, OpenAI: {id, type, function.name, function.arguments.*}, Gemini: {functionCall.name, functionCall.args.*}). Prefer the most human-readable scalar from the tool's arguments (input / arguments / args / params) over the tool name.

Array access: use .0. for nested arrays. When root is an array (paths start with []), wrap with {{#.}}...{{/.}} and use inner paths.

Rules:
- Pick the single most descriptive content field. Use {{{ }}} (triple braces). Never add markdown or styling.
- null ONLY if every field is [meta]/[id] or empty.
- Prefer scalar fields over primitive arrays. Paths ending in []: type (e.g. ids[]: string, tags[]: string) are primitive-value lists with unstable element order. Never use .0. to index into them. Treat them as [meta] when any scalar field exists. Using .0. is only acceptable for arrays of objects with known nested structure (e.g. choices[].message.content).
- Dictionary paths: paths containing {*} (e.g. tasks{*}: string) represent objects with dynamic/arbitrary key names that vary across instances. They cannot be referenced in Mustache templates. Treat as [meta].

Field classification:
- [meta] fields (skip): id, ids, status, type, types, kind, mode, version, role, model, usage, timestamp, duration, finish_reason, token_count, index, logprobs, created, object, system_fingerprint, signature, tool_use_id. Also includes fields whose values are opaque references (serialized object pointers, memory addresses).
- [id] fields (skip when siblings have scalar content): name, action, function, method, tool. These identify what operation runs and are shown in the span header. Never include them in the preview when other scalar content fields exist. Primitive array siblings do not count as content.
- Content fields (prefer, in order of preference): description, summary, command, query, action, prompt, message, text, content, answer, title, path, url, code, output, result. When multiple exist, pick the earliest-listed one.

Decision order:
1. Scalar content field present → {{{field}}}
2. [id] field present + scalar sibling fields under a nested key (input/arguments/args/params/body or any sub-object) → pick the single most descriptive short string leaf from those siblings as {{{nested.leaf}}}. If the only siblings are [meta], primitive arrays, or null → use the [id] field.
3. [id] field is the only non-meta scalar field → {{{field}}}
4. Multiple non-meta, non-id scalar fields → pick the single most descriptive one as {{{field}}}
5. Deeply nested scalar leaf → {{{path.0.to.0.field}}}
6. All [meta]/[id]/empty → null

Examples:
- "choices[].message.content: string" → {{{choices.0.message.content}}}
- "[].output[].content[].text: string" → {{#.}}{{{output.0.content.0.text}}}{{/.}}
- Anthropic tool_use: "type: string [meta]" + "id: string [meta]" + "name: string [id]" + "input.command: string" + "input.description: string" → {{{input.description}}}
- Anthropic tool_use: "type: string [meta]" + "name: string [id]" + "input.query: string" + "input.max_results: number" → {{{input.query}}}
- Anthropic tool_use: "type: string [meta]" + "name: string [id]" + "input.path: string" + "input.old_str: string" → {{{input.path}}}
- OpenAI tool_call: "id: string [meta]" + "type: string [meta]" + "function.name: string [id]" + "function.arguments.description: string" → {{{function.arguments.description}}}
- OpenAI tool_call: "function.name: string [id]" + "function.arguments.query: string" → {{{function.arguments.query}}}
- Gemini functionCall: "functionCall.name: string [id]" + "functionCall.args.query: string" → {{{functionCall.args.query}}}
- "name: string [id]" + "input.query: string" + "input.max_results: number" → {{{input.query}}}
- "action: string [id]" + "params.file_name: string" + "params.old_str: string" → {{{params.file_name}}}
- "action: string [id]" + "params.keys: string" → {{{params.keys}}}
- "action: string [id]" + "params.index: number [meta]" → {{{action}}}
- "command: string [id]" + "ids[]: string [meta]" + "agent_types[]: string" → {{{command}}}
- "command: string [id]" + "tasks{*}: string" + "kind: string [meta]" → {{{command}}}
- "name: string [id]" + "arguments.command: string" → {{{arguments.command}}}
- "command: string" → {{{command}}}
- "score: number" + "grade: string" → {{{grade}}}
- "id: string [meta]" + "name: string" + "type: string [meta]" → {{{name}}}
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
    const { text } = await observe({ name: "generate-preview-keys" }, async () =>
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
