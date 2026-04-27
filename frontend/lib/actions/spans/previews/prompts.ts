import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateText } from "ai";

import { getLanguageModel } from "@/lib/ai/model";

import { flattenPaths } from "./utils.ts";

export type PreviewVariant = "generic" | "llm_tool_only";

const PREVIEW_KEY_SYSTEM_PROMPT = `<task>
Pick ONE field from each schema to build a short Mustache preview template. Output exactly one template per input structure, in order, as a JSON array.
</task>

<input_format>
Each <span> lists paths for one structure. A path looks like: \`key.subkey: type [tag] = "sample"\`.
- type: string | number | boolean | object.
- tag (optional): [meta] = skip, [id] = skip unless it's the only non-meta scalar.
- sample (optional): a short example value; use it to judge which field is most human-readable.
- \`a[]\` = array of scalars (unstable order; never index with .0.). \`a[].b\` = array of objects (indexing with .0. is ok).
- \`a{*}\` = dictionary with arbitrary keys (cannot be templated; treat as [meta]).
</input_format>

<output_format>
- Use triple braces: \`{{{path}}}\`. No markdown, no styling, no extra text.
- When root is an array (paths start with \`[]\`), wrap with \`{{#.}}...{{/.}}\` and use inner paths.
- Return \`null\` only when every field is [meta]/[id]/empty (or for mode=llm_tool_only, see below).
</output_format>

<field_classification>
- [meta] (always skip): id, ids, status, type, types, kind, mode, version, role, model, usage, timestamp, duration, finish_reason, token_count, index, logprobs, created, object, system_fingerprint, signature, tool_use_id. Also: values that look like opaque references (e.g. \`<Foo at 0x…>\`).
- [id] (skip when any scalar content sibling exists): name, action, command, function, method, tool. These are already shown in the span header.
- content (prefer, earliest wins): description, summary, query, prompt, message, text, content, answer, title, path, url, code, output, result.
</field_classification>

<decision_order>
1. Scalar content field present → \`{{{field}}}\`.
2. [id] with scalar siblings under a nested key (input / arguments / args / params / body / …) → pick the most descriptive short string leaf as \`{{{nested.leaf}}}\`. If siblings are only [meta] / primitive arrays / null → fall through.
3. [id] is the only non-meta scalar → \`{{{field}}}\`.
4. Multiple non-meta, non-id scalars → pick the most descriptive one.
5. Deeply nested scalar leaf → \`{{{a.0.b.0.c}}}\`.
6. Everything [meta]/[id]/empty → \`null\`.
</decision_order>

<mode name="llm_tool_only">
When a span is tagged \`mode="llm_tool_only"\`, its structure is a single tool's arguments from an LLM output that produced no visible text or thinking. The preview must describe the model's INTENT in natural language.
Only these keys are allowed, in priority order. Pick the earliest one that exists with a non-empty string sample:
  \`description\`, \`summary\`, \`title\`, \`goal\`, \`intent\`, \`reasoning\`, \`thought\`, \`instructions\`, \`question\`, \`prompt\`, \`message\`.
No other key is ever a valid choice — not \`query\`, \`path\`, \`file_path\`, \`url\`, \`command\`, \`code\`, \`pattern\`, \`input\`, \`args\`, \`params\`, \`name\`, \`action\`, etc. If none of the allowed keys exists (or the chosen key's sample is empty / [meta]) → \`null\`.
Never invent a path, never fall back to "the only available field". \`null\` is the correct answer when no allowed key is present.
</mode>

<examples mode="generic">
  <ex in='choices[].message.content: string = "Sure! Here is…"' out="{{{choices.0.message.content}}}"/>
  <ex in='[].output[].content[].text: string' out="{{#.}}{{{output.0.content.0.text}}}{{/.}}"/>
  <ex in='type: string [meta] | id: string [meta] | name: string [id] | input.command: string | input.description: string' out="{{{input.description}}}"/>
  <ex in='name: string [id] | input.query: string | input.max_results: number' out="{{{input.query}}}"/>
  <ex in='name: string [id] | input.path: string | input.old_str: string' out="{{{input.path}}}"/>
  <ex in='function.name: string [id] | function.arguments.description: string' out="{{{function.arguments.description}}}"/>
  <ex in='functionCall.name: string [id] | functionCall.args.query: string' out="{{{functionCall.args.query}}}"/>
  <ex in='action: string [id] | params.file_name: string | params.old_str: string' out="{{{params.file_name}}}"/>
  <ex in='action: string [id] | params.index: number [meta]' out="{{{action}}}"/>
  <ex in='command: string [id] | ids[]: string [meta] | agent_types[]: string' out="{{{command}}}"/>
  <ex in='command: string [id] | tasks{*}: string | kind: string [meta]' out="{{{command}}}"/>
  <ex in='command: string' out="{{{command}}}"/>
  <ex in='score: number | grade: string' out="{{{grade}}}"/>
  <ex in='id: string [meta] | name: string | type: string [meta]' out="{{{name}}}"/>
  <ex in='name: string [meta] | id: string [meta] | type: string [meta]' out="null"/>
</examples>

<examples mode="llm_tool_only">
  <ex in='description: string = "Fix the login bug in auth.ts"' out="{{{description}}}"/>
  <ex in='summary: string = "Adds null check to handler"' out="{{{summary}}}"/>
  <ex in='title: string = "Refactor user service"' out="{{{title}}}"/>
  <ex in='goal: string = "Improve test coverage for billing module"' out="{{{goal}}}"/>
  <ex in='reasoning: string = "User wants to verify their subscription renewed"' out="{{{reasoning}}}"/>
  <ex in='thought: string = "I should read the config first to understand defaults"' out="{{{thought}}}"/>
  <ex in='question: string = "What is the capital of France?"' out="{{{question}}}"/>
  <ex in='instructions: string = "Summarize the PR diff in two sentences"' out="{{{instructions}}}"/>
  <ex in='description: string = "Update onboarding flow" | summary: string = "Also applies to mobile"' out="{{{description}}}"/>
  <ex in='summary: string = "Adds retry logic" | title: string = "Improve resilience"' out="{{{summary}}}"/>
  <ex in='description: string = ""' out="null"/>
</examples>`;

export type PreviewKeyResult = Array<string | null>;

interface SpanStructure {
  data: unknown;
  variant?: PreviewVariant;
}

const buildUserMessage = (structures: SpanStructure[]): string => {
  const spanElements = structures
    .map((s, i) => {
      const paths = flattenPaths(s.data);
      const modeAttr = s.variant === "llm_tool_only" ? ' mode="llm_tool_only"' : "";
      return `<span index="${i}"${modeAttr}>\n${paths.join("\n")}\n</span>`;
    })
    .join("\n");

  return `<structures count="${structures.length}">
${spanElements}
</structures>
<response_format>
Return exactly ${structures.length} templates as a JSON array of strings (use the literal \`null\` for no preview). No prose, no markdown fences.
</response_format>`;
};

const parsePreviewKeysResponse = (text: string, expectedLength: number): PreviewKeyResult => {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return new Array(expectedLength).fill(null);

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return new Array(expectedLength).fill(null);
    return parsed.map((v: unknown) => {
      if (typeof v !== "string") return null;
      const t = v.trim();
      if (t === "" || t.toLowerCase() === "null") return null;
      return v;
    });
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
