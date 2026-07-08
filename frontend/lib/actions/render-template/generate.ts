import { observe } from "@lmnr-ai/lmnr";
import { stepCountIs, ToolLoopAgent } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

import { buildGenerateInstructions } from "./prompts";
import { createVfsTools, FILTER_FILE, TEMPLATE_FILE, type Vfs } from "./tools";
import { validateTemplateCode } from "./validate";

const GenerateSchema = z.object({
  projectId: z.guid(),
  scope: z.enum(["span", "trace"]),
  description: z.string().min(1, "Description is required"),
  /** Groups every generation of one template into a single Laminar session.
   *  Editing → the template id; creating → an ephemeral per-dialog draft id. */
  sessionId: z.string().optional(),
  /** Existing template code when editing; empty/absent when creating. */
  currentCode: z.string().optional(),
  /** Existing WHERE clause when editing a trace template. */
  currentWhereClause: z.string().nullish(),
  /** Sample `data` (span scope) — JSON string shown to the agent for context. */
  sampleData: z.string().optional(),
  /** Trace outline (trace scope) — JSON string of representative spans. */
  traceOutline: z.string().optional(),
});

export type GenerateTemplateInput = z.infer<typeof GenerateSchema>;

export interface GenerateTemplateResult {
  code: string;
  /** Only present for trace scope. */
  whereClause?: string;
}

// Runaway guard — the agent should finish in a handful of steps (write → validate → fix).
const MAX_STEPS = 12;

const buildUserPrompt = (input: GenerateTemplateInput): string => {
  const parts: string[] = [];
  parts.push(
    input.currentCode?.trim() ? "Modify the existing template per this request:" : "Create a template for this request:"
  );
  parts.push(`<request>\n${input.description.trim()}\n</request>`);
  if (input.scope === "trace" && input.traceOutline?.trim()) {
    parts.push(`<trace_outline>\n${input.traceOutline.trim()}\n</trace_outline>`);
  }
  if (input.scope === "span" && input.sampleData?.trim()) {
    parts.push(`<sample_data>\n${input.sampleData.trim()}\n</sample_data>`);
  }
  return parts.join("\n\n");
};

/**
 * In-platform render-template generation. Runs an AI SDK v7 ToolLoopAgent that
 * edits a virtual filesystem (template.jsx, + filter.sql for trace) and
 * syntax-validates before finishing. Returns whatever ended up in the VFS —
 * the modal drops it into the editor + preview. Matches the mock's signature.
 */
export const generateTemplate = async (input: GenerateTemplateInput): Promise<GenerateTemplateResult> => {
  const parsed = GenerateSchema.parse(input);
  const { projectId, scope } = parsed;

  const vfs: Vfs = { [TEMPLATE_FILE]: parsed.currentCode ?? "" };
  const allowedPaths = [TEMPLATE_FILE];
  if (scope === "trace") {
    vfs[FILTER_FILE] = parsed.currentWhereClause ?? "";
    allowedPaths.push(FILTER_FILE);
  }

  await observe(
    { name: "generateRenderTemplate", sessionId: parsed.sessionId, input: { projectId, scope } },
    async () => {
      const agent = new ToolLoopAgent({
        model: getLanguageModel("medium"),
        instructions: buildGenerateInstructions(scope),
        tools: createVfsTools(vfs, allowedPaths),
        stopWhen: stepCountIs(MAX_STEPS),
      });
      await agent.generate({ prompt: buildUserPrompt(parsed) });
    }
  );

  const code = (vfs[TEMPLATE_FILE] ?? "").trim();
  if (!code) {
    throw new Error("Generation produced no template code. Please try again with a clearer description.");
  }

  // Best-effort: the agent is instructed to validate before finishing, but on step
  // exhaustion it may stop with a syntax error. Surface it rather than silently
  // returning broken code the preview can't render.
  const validation = validateTemplateCode(code);
  if (!validation.ok) {
    throw new Error(`Generated template has a syntax error: ${validation.error}`);
  }

  return scope === "trace" ? { code, whereClause: (vfs[FILTER_FILE] ?? "").trim() } : { code };
};
