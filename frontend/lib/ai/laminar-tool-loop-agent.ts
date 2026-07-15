import { observe } from "@lmnr-ai/lmnr";
import { stepCountIs, ToolLoopAgent, type ToolSet } from "ai";

import { getLanguageModel, type ModelTier } from "./model";

// The AI SDK v7 ToolLoopAgent's constructor settings, with default generics.
// Tool argument types are inferred at each `tool({...})` call site, so the
// agent itself doesn't need to be generic over TOOLS here.
type ToolLoopSettings = ConstructorParameters<typeof ToolLoopAgent<never, ToolSet>>[0];

const DEFAULT_MAX_STEPS = 12;

export type LaminarToolLoopAgentOptions = Omit<ToolLoopSettings, "model"> & {
  /** Laminar span name grouping the whole agent run. */
  name: string;
  /** Model tier; defaults to "medium". Provide `model` to override entirely. */
  tier?: ModelTier;
  /** Tool-loop step cap; defaults to 12. Provide `stopWhen` to override entirely. */
  maxSteps?: number;
  /** Extra Laminar span metadata. */
  metadata?: Record<string, unknown>;
  /** Groups related runs into one Laminar session. */
  sessionId?: string;
  /** Override the tier-derived model. */
  model?: ToolLoopSettings["model"];
};

/**
 * Laminar's flavor of the AI SDK `ToolLoopAgent` — same surface, but with our
 * defaults baked in (model tier, step cap) and every run wrapped in an `observe`
 * span so it shows up in Laminar. Like `ui/button` wraps the base button: pass
 * the usual ToolLoopAgent settings (`instructions`, `tools`, …) and everything
 * is overrideable (`model`/`stopWhen` win over the tier/maxSteps defaults).
 *
 * Use `.run(prompt)` instead of `.generate({ prompt })` to get the observe span.
 * (The AI SDK's own telemetry is registered globally, so the underlying LLM
 * calls are traced regardless; `.run` just adds the feature-level parent span.)
 */
export class LaminarToolLoopAgent extends ToolLoopAgent<never, ToolSet> {
  private readonly observeArgs: { name: string; metadata?: Record<string, unknown>; sessionId?: string };

  constructor(options: LaminarToolLoopAgentOptions) {
    const { name, tier = "medium", maxSteps = DEFAULT_MAX_STEPS, metadata, sessionId, ...settings } = options;
    super({
      model: getLanguageModel(tier),
      stopWhen: stepCountIs(maxSteps),
      ...settings,
    } as ToolLoopSettings);
    this.observeArgs = { name, metadata, sessionId };
  }

  /** Run the agent inside a named Laminar span. */
  run(prompt: string) {
    return observe({ ...this.observeArgs }, () => this.generate({ prompt }));
  }
}
