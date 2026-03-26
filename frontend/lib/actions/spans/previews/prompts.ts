import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

import { flattenPaths } from "./utils.ts";

const PREVIEW_KEY_SYSTEM_PROMPT = `Pick fields from a schema to build a short Mustache preview template. One template per structure. Replace [] with .0. for direct access.

Rules:
- Pick 1-3 content fields. Prefer string fields without [meta].
- {{{ }}} for long text strings. **bold** for labels/names.
- null ONLY if every field is [meta] or empty.
- Skip [meta] fields: id, status, type, mode, version, role, model, usage, timestamp, duration, finish_reason, token_count, index, logprobs, created, object, system_fingerprint.

Decision order:
1. Single text field (content, text, result, output, message, answer) → {{{field}}}
2. Label + value pair → **{{label}}** — {{value}}
3. "name" as only non-meta field → **{{name}}**
4. Array with name+value items → {{#arr}}\n- **{{name}}**: {{value}}\n{{/arr}}
5. Deeply nested leaf → {{{path.0.to.0.field}}}
6. All [meta]/empty → null

Examples:
- "score: number" + "grade: string" → **{{grade}}** — {{score}}
- "id: string [meta]" + "name: string" + "type: string [meta]" → **{{name}}**
- "items[].name: string" + "items[].value: string" → {{#items}}\n- **{{name}}**: {{value}}\n{{/items}}
- "choices[].message.content: string" → {{{choices.0.message.content}}}
- "data.spans[].output[].content[].text: string" → {{{data.spans.0.output.0.content.0.text}}}
- "id: string [meta]" + "status: string [meta]" + "version: string [meta]" → null`;

const PreviewKeyResultSchema = z.array(z.string().nullable());

export type PreviewKeyResult = z.infer<typeof PreviewKeyResultSchema>;

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

  return `<structures count="${structures.length}">\n${spanElements}\n</structures>\nReturn exactly ${structures.length} templates.`;
};

export const generatePreviewKeys = async (structures: SpanStructure[]): Promise<PreviewKeyResult> => {
  if (structures.length === 0) return [];

  const { object } = await observe({ name: "generatePreviewKeys" }, async () =>
    generateObject({
      model: getLanguageModel("lite"),
      schema: PreviewKeyResultSchema,
      system: PREVIEW_KEY_SYSTEM_PROMPT,
      prompt: buildUserMessage(structures),
      maxRetries: 0,
      temperature: 0,
      experimental_telemetry: {
        isEnabled: true,
        tracer: getTracer(),
      },
    })
  );

  return object;
};
