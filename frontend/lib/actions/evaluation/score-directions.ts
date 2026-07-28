import { observe } from "@lmnr-ai/lmnr";
import { generateText, Output } from "ai";
import { z } from "zod";

import { getLanguageModel, isAiProviderConfigured } from "@/lib/ai/model";
import { cache, SCORE_DIRECTION_CACHE_KEY } from "@/lib/cache";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
// Cap the LLM classification batch — score-name lists are tiny in practice,
// but guard against a pathological project with hundreds of distinct names.
const MAX_CLASSIFY = 100;

/**
 * App-wide LLM-inferred score direction (name -> isHigherBetter) — the DEFAULT
 * layer only. Per-project manual overrides live in projects.settings and are
 * applied on top client-side, so this layer is project-independent and its
 * results are cached even for names a project has overridden.
 */
export type ScoreDirectionDefaults = Record<string, boolean>;

const normalize = (name: string): string => name.trim().toLowerCase();

const ClassificationSchema = z.object({
  scores: z.array(
    z.object({
      name: z.string().describe("The exact score name, echoed verbatim"),
      isHigherBetter: z.boolean().describe("true if a HIGHER value is better, false if a LOWER value is better"),
    })
  ),
});

// One LLM call classifying every uncached name. Case-insensitive match back to
// the requested names. Any name the model omits stays unresolved (caller
// defaults it to true). Fails soft: returns {} on any error.
async function classifyDirections(names: string[]): Promise<Record<string, boolean>> {
  try {
    const { output } = await observe(
      { name: "classify-score-directions", metadata: { feature: "eval-score-direction" } },
      async () =>
        generateText({
          model: getLanguageModel("small"),
          output: Output.object({ schema: ClassificationSchema }),
          system:
            "You classify evaluation metric names by their preferred direction. " +
            "For each name, decide whether a HIGHER value is better (isHigherBetter=true) or a LOWER value is better (false). " +
            "Higher-is-better: accuracy, precision, recall, f1, relevance, faithfulness, helpfulness, correctness, similarity, bleu, rouge. " +
            "Lower-is-better: hallucination, toxicity, latency, cost, error_rate, perplexity, bias, refusal_rate, duration. " +
            "When genuinely ambiguous, default to true. Echo each name back exactly as given.",
          prompt: JSON.stringify(names),
          maxRetries: 0,
          temperature: 0,
          abortSignal: AbortSignal.timeout(15000),
        })
    );

    // Map the model's (possibly re-cased) names back to the requested ones.
    const byNorm = new Map(output.scores.map((s) => [normalize(s.name), s.isHigherBetter]));
    const result: Record<string, boolean> = {};
    for (const name of names) {
      const v = byNorm.get(normalize(name));
      if (typeof v === "boolean") result[name] = v;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Resolve the app-wide default `isHigherBetter` for each score name from the
 * global cache; cache misses trigger ONE batched LLM classification (gated on a
 * configured AI provider) and are written back with a 7-day TTL. A name the LLM
 * can't resolve (or when no provider is configured) defaults to `true`, matching
 * the historical hardcoded "bigger is better" behavior. Project overrides are
 * NOT consulted here — they are layered on top client-side — so the LLM
 * suggestion is still computed and cached even for a name a project overrides.
 */
export async function resolveScoreDirections(scoreNames: string[]): Promise<ScoreDirectionDefaults> {
  const names = [...new Set(scoreNames)].filter((n) => n.length > 0);
  if (names.length === 0) return {};

  const resolved: ScoreDirectionDefaults = {};

  const cached = await Promise.all(
    names.map((name) => cache.get<boolean>(SCORE_DIRECTION_CACHE_KEY(normalize(name))).catch(() => null))
  );

  const misses: string[] = [];
  names.forEach((name, i) => {
    const c = cached[i];
    if (typeof c === "boolean") {
      resolved[name] = c;
    } else {
      misses.push(name);
    }
  });

  if (misses.length === 0) return resolved;

  if (!isAiProviderConfigured()) {
    for (const name of misses) resolved[name] = true;
    return resolved;
  }

  const classified = await classifyDirections(misses.slice(0, MAX_CLASSIFY));

  const saves: Promise<void>[] = [];
  for (const name of misses) {
    const v = classified[name];
    resolved[name] = typeof v === "boolean" ? v : true;
    if (typeof v === "boolean") {
      saves.push(
        cache
          .set(SCORE_DIRECTION_CACHE_KEY(normalize(name)), v, { expireAfterSeconds: CACHE_TTL_SECONDS })
          .catch(() => {})
      );
    }
  }
  await Promise.all(saves);

  return resolved;
}
