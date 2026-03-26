import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

import { flattenPaths } from "./utils.ts";

const PREVIEW_KEY_SYSTEM_PROMPT = `Pick fields from a schema to build a short Mustache preview template. One template per structure. Replace [] with .0. for direct access.

Examples:
- "content: string" → {{{content}}}
- "text: string" → {{{text}}}
- "result: string" → {{{result}}}
- "output: string" → {{{output}}}
- "message: string" → {{{message}}}
- "answer: string" → {{{answer}}}
- "score: number" + "grade: string" → **{{grade}}** — {{score}}
- "target: string" + "performance_grade: string" → **{{target}}** — {{performance_grade}}
- "name: string" + "args.span_ids[]: string" → **{{name}}**
- "name: string" (only non-meta field) → **{{name}}**
- "id: string [meta]" + "name: string" + "type: string [meta]" → **{{name}}**
- "is_done: boolean" + "extracted_content: string" + "long_term_memory: string" → {{{extracted_content}}}
- "items[].name: string" + "items[].value: string" → {{#items}}\n- **{{name}}**: {{value}}\n{{/items}}
- "results[].label: string" + "results[].score: number" → {{#results}}\n- **{{label}}**: {{score}}\n{{/results}}
- "choices[].message.content: string" → {{{choices.0.message.content}}}
- "data.spans[].output[].content[].text: string" → {{{data.spans.0.output.0.content.0.text}}}
- "RequiresNextStep.reason.ToolResult.spans[].output.result: string" → {{{RequiresNextStep.reason.ToolResult.spans.0.output.result}}}
- "market_analysis.topic: string" + "data_quality.confidence_score: number" → **{{market_analysis.topic}}**
- "id: string [meta]" + "status: string [meta]" + "version: string [meta]" → null

Rules:
- Pick 1-3 content fields. Prefer string fields without [meta].
- {{{ }}} for long text strings. **bold** for labels.
- null ONLY if every field is [meta] or empty.`;

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
      experimental_telemetry: {
        isEnabled: true,
        tracer: getTracer(),
      },
    })
  );

  return object;
};
