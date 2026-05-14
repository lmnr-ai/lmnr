import { observe } from "@lmnr-ai/lmnr";

import { cache } from "@/lib/cache";

import { type ParsedInput, type TextPart } from "./parse-input";
import { applyRegex, generateExtractionRegex } from "./prompts";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const REGEX_CACHE_PREFIX = "trace_input_regex:";
const BATCH_SIZE = 10;

const SCAFFOLDING_PATTERN = /^\s*<([a-z][a-z0-9_-]*)[\s>][\s\S]*<\/\1>\s*$/i;

function looksLikeScaffolding(text: string): boolean {
  return SCAFFOLDING_PATTERN.test(text);
}

export function joinUserParts(parts: TextPart[]): string | null {
  if (parts.length === 0) return null;
  const text = parts
    .map((p) => p.text)
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
}

// Sequence of top-level XML-like tags, or "plain" for tag-free messages.
export function fingerprintUserMessage(input: string): string {
  const TOP_LEVEL_TAG = /<([a-zA-Z_][\w-]*)\b[^>]*>([\s\S]*?)<\/\1\s*>/;
  const parts: string[] = [];
  let rest = input;

  while (rest.length > 0) {
    const match = TOP_LEVEL_TAG.exec(rest);
    if (!match) {
      if (rest.trim().length > 0) parts.push("plain");
      break;
    }
    const before = rest.slice(0, match.index);
    if (before.trim().length > 0) parts.push("plain");
    const name = match[1].toLowerCase();
    parts.push(name, `/${name}`);
    rest = rest.slice(match.index + match[0].length);
  }

  const deduped = parts.filter((p, i) => !(p === "plain" && parts[i - 1] === "plain"));
  return deduped.length ? deduped.join(",") : "plain";
}

interface TraceForExtraction {
  traceId: string;
  output: string | null;
  parsed: ParsedInput | null;
}

type ExtractionPath =
  | "no-samples"
  | "cache-hit"
  | "cache-stale-regenerated"
  | "cache-miss-regenerated"
  | "llm-no-regex";

type TraceResult = { inputPreview: string | null; outputPreview: string | null; outputSpan: unknown };
type ResultsMap = Record<string, TraceResult>;

// For a group of traces sharing a system prompt, retrieve or generate a regex
// and apply it to extract each trace's input. `results` is mutated in place;
// trace-io.ts hydrates the full Span afterwards.
export async function extractInputsForGroup(
  systemHash: string,
  projectId: string,
  traces: TraceForExtraction[],
  results: ResultsMap,
  fingerprint: string = "plain"
): Promise<void> {
  const cacheKey = `${REGEX_CACHE_PREFIX}${projectId}:${systemHash}:${fingerprint}`;

  await observe(
    {
      name: "traces:extract-inputs",
      input: { projectId, systemHash, fingerprint, traceCount: traces.length, cacheKey },
    },
    async () => {
      const cacheOutcome = await tryCachedRegex(cacheKey, traces, results);
      if (cacheOutcome.cacheHitFullyApplied) {
        return {
          path: "cache-hit" satisfies ExtractionPath,
          extractedFromCache: cacheOutcome.extractedCount,
          tracesFulfilled: traces.length,
        };
      }

      const samples = traces.slice(0, BATCH_SIZE).filter((t) => t.parsed && t.parsed.userParts.length > 0);
      if (samples.length === 0) {
        for (const trace of traces) {
          results[trace.traceId] = {
            inputPreview: joinUserParts(trace.parsed?.userParts ?? []),
            outputPreview: trace.output,
            outputSpan: null,
          };
        }
        return {
          path: "no-samples" satisfies ExtractionPath,
          tracesFulfilled: traces.length,
          previousCacheState: cacheOutcome.cacheState,
        };
      }

      const llmOutcome = await runRegexExtraction(cacheKey, traces, samples, results);

      const path: ExtractionPath = !llmOutcome.regexGenerated
        ? "llm-no-regex"
        : cacheOutcome.cacheState === "stale"
          ? "cache-stale-regenerated"
          : "cache-miss-regenerated";

      return {
        path,
        sampleCount: samples.length,
        regexGenerated: llmOutcome.regexGenerated,
        extractedFromLlm: llmOutcome.extractedCount,
        cachedAfterLlm: llmOutcome.cached,
        tracesFulfilled: traces.length,
        previousCacheState: cacheOutcome.cacheState,
      };
    }
  );
}

interface CacheOutcome {
  cacheState: "miss" | "hit" | "stale" | "error";
  cacheHitFullyApplied: boolean;
  extractedCount: number;
}

// Cached regex must match EVERY trace; one failure invalidates it and stages
// are discarded so the regenerated regex owns the whole batch.
async function tryCachedRegex(
  cacheKey: string,
  traces: TraceForExtraction[],
  results: ResultsMap
): Promise<CacheOutcome> {
  return observe({ name: "traces:cache-lookup", input: { cacheKey, traceCount: traces.length } }, async () => {
    let cachedRegex: string | null = null;
    let cacheError: string | null = null;
    try {
      cachedRegex = await cache.get<string>(cacheKey);
    } catch (error) {
      cacheError = error instanceof Error ? error.message : String(error);
    }

    if (cacheError) {
      return {
        outcome: { cacheState: "error" as const, cacheHitFullyApplied: false, extractedCount: 0 },
        error: cacheError,
      };
    }

    if (!cachedRegex) {
      return {
        outcome: { cacheState: "miss" as const, cacheHitFullyApplied: false, extractedCount: 0 },
        hit: false,
      };
    }

    const stagedResults: ResultsMap = {};
    let allMatched = true;
    let extractedCount = 0;
    let noUserRequestCount = 0;
    let firstFailureTraceId: string | null = null;

    for (const trace of traces) {
      const joinedText = joinUserParts(trace.parsed?.userParts ?? []);
      if (!joinedText) {
        stagedResults[trace.traceId] = { inputPreview: null, outputPreview: trace.output, outputSpan: null };
        continue;
      }
      const result = applyRegex(cachedRegex, joinedText);
      if (result.kind === "extracted") {
        stagedResults[trace.traceId] = {
          inputPreview: result.text,
          outputPreview: trace.output,
          outputSpan: null,
        };
        extractedCount++;
      } else if (result.kind === "no-user-request") {
        stagedResults[trace.traceId] = { inputPreview: null, outputPreview: trace.output, outputSpan: null };
        noUserRequestCount++;
      } else {
        allMatched = false;
        firstFailureTraceId = trace.traceId;
        break;
      }
    }

    if (allMatched) {
      Object.assign(results, stagedResults);
      await cache.expire(cacheKey, SEVEN_DAYS_SECONDS).catch(() => {});
      return {
        outcome: {
          cacheState: "hit" as const,
          cacheHitFullyApplied: true,
          extractedCount,
        },
        hit: true,
        ttlRefreshed: true,
        extractedCount,
        noUserRequestCount,
        cachedRegex,
      };
    }

    await cache.remove(cacheKey).catch(() => {});
    return {
      outcome: {
        cacheState: "stale" as const,
        cacheHitFullyApplied: false,
        extractedCount: 0,
      },
      hit: true,
      invalidated: true,
      firstFailureTraceId,
      cachedRegex,
    };
  }).then(({ outcome }) => outcome);
}

interface LlmOutcome {
  regexGenerated: boolean;
  extractedCount: number;
  cached: boolean;
}

async function runRegexExtraction(
  cacheKey: string,
  traces: TraceForExtraction[],
  samples: TraceForExtraction[],
  results: ResultsMap
): Promise<LlmOutcome> {
  return observe(
    {
      name: "traces:generate-regex",
      input: { cacheKey, sampleCount: samples.length, traceCount: traces.length },
    },
    async () => {
      const allUserParts = samples.map((s) => s.parsed!.userParts);
      const llmInput = buildDeduplicatedLLMInput(allUserParts);
      const regex = await generateExtractionRegex(llmInput);

      if (!regex) {
        for (const trace of traces) {
          if (!(trace.traceId in results)) {
            results[trace.traceId] = {
              inputPreview: joinUserParts(trace.parsed?.userParts ?? []),
              outputPreview: trace.output,
              outputSpan: null,
            };
          }
        }
        return {
          outcome: { regexGenerated: false, extractedCount: 0, cached: false },
          reason: "llm-returned-null",
        };
      }

      let anyMatch = false;
      let extractedCount = 0;
      let noUserRequestCount = 0;
      let fallbackToJoinedCount = 0;

      for (const trace of traces) {
        const joinedText = joinUserParts(trace.parsed?.userParts ?? []);
        if (!joinedText) {
          results[trace.traceId] = { inputPreview: null, outputPreview: trace.output, outputSpan: null };
          continue;
        }
        const result = applyRegex(regex, joinedText);
        if (result.kind === "extracted") {
          results[trace.traceId] = { inputPreview: result.text, outputPreview: trace.output, outputSpan: null };
          extractedCount++;
          anyMatch = true;
        } else if (result.kind === "no-user-request") {
          results[trace.traceId] = { inputPreview: null, outputPreview: trace.output, outputSpan: null };
          noUserRequestCount++;
          anyMatch = true;
        } else {
          results[trace.traceId] = { inputPreview: joinedText, outputPreview: trace.output, outputSpan: null };
          fallbackToJoinedCount++;
        }
      }

      let cached = false;
      if (anyMatch) {
        cached = await persistRegex(cacheKey, regex);
      }

      return {
        outcome: { regexGenerated: true, extractedCount, cached },
        regex,
        extractedCount,
        noUserRequestCount,
        fallbackToJoinedCount,
        anyMatch,
      };
    }
  ).then(({ outcome }) => outcome);
}

// Persist failure is non-fatal; extractions are returned regardless.
async function persistRegex(cacheKey: string, regex: string): Promise<boolean> {
  return observe({ name: "traces:cache-save", input: { cacheKey, regex } }, async () => {
    try {
      await cache.set(cacheKey, regex, { expireAfterSeconds: SEVEN_DAYS_SECONDS });
      return { saved: true };
    } catch (error) {
      return { saved: false, error: error instanceof Error ? error.message : String(error) };
    }
  }).then(({ saved }) => saved);
}

// Dedupes parts identical across samples by index; for a single sample,
// detects scaffolding structurally so the LLM can ignore it.
function buildDeduplicatedLLMInput(allParts: TextPart[][]): string {
  if (allParts.length === 1) {
    return buildSingleSampleInput(allParts[0]);
  }

  return buildMultiSampleInput(allParts);
}

function buildSingleSampleInput(parts: TextPart[]): string {
  if (parts.length === 1) return parts[0].text;

  const scaffoldingIndices = new Set<number>();
  for (let i = 0; i < parts.length; i++) {
    if (looksLikeScaffolding(parts[i].text)) {
      scaffoldingIndices.add(i);
    }
  }

  if (scaffoldingIndices.size === 0) {
    return parts.map((p, i) => `[Part ${i + 1}]\n${p.text}`).join("\n\n");
  }

  if (scaffoldingIndices.size === parts.length) {
    return parts.map((p, i) => `[Part ${i + 1}]\n${p.text}`).join("\n\n");
  }

  const sections: string[] = [];

  sections.push("== SCAFFOLDING PARTS (system-injected context, skip these) ==");
  for (const idx of scaffoldingIndices) {
    sections.push(`[Part ${idx + 1} — scaffolding]\n${parts[idx].text}`);
  }

  sections.push("== USER REQUEST (the actual user input to capture) ==");
  for (let i = 0; i < parts.length; i++) {
    if (!scaffoldingIndices.has(i)) {
      sections.push(`[Part ${i + 1}]\n${parts[i].text}`);
    }
  }

  return sections.join("\n\n");
}

function buildMultiSampleInput(allParts: TextPart[][]): string {
  const maxParts = Math.max(...allParts.map((p) => p.length));
  const sections: string[] = [];

  const sharedAtIndex = new Map<number, string>();
  const scaffoldingAtIndex = new Set<number>();

  for (let idx = 0; idx < maxParts; idx++) {
    const textsAtIdx = allParts.filter((parts) => idx < parts.length).map((parts) => parts[idx].text);

    if (textsAtIdx.length === allParts.length && textsAtIdx.every((t) => t === textsAtIdx[0])) {
      sharedAtIndex.set(idx, textsAtIdx[0]);
    } else if (textsAtIdx.every((t) => looksLikeScaffolding(t))) {
      scaffoldingAtIndex.add(idx);
    }
  }

  if (sharedAtIndex.size > 0 || scaffoldingAtIndex.size > 0) {
    sections.push("== SHARED / SCAFFOLDING PARTS (system-injected context, skip these) ==");
    for (const [idx, text] of sharedAtIndex) {
      sections.push(`[Part ${idx + 1} — shared]\n${text}`);
    }
    for (const idx of scaffoldingAtIndex) {
      const sample = allParts.find((parts) => idx < parts.length);
      if (sample) {
        sections.push(`[Part ${idx + 1} — scaffolding (varies per trace but is system context)]\n${sample[idx].text}`);
      }
    }
  }

  const skipIndices = new Set([...sharedAtIndex.keys(), ...scaffoldingAtIndex]);

  for (let sampleIdx = 0; sampleIdx < allParts.length; sampleIdx++) {
    const parts = allParts[sampleIdx];
    const uniqueParts = parts.map((p, idx) => ({ part: p, idx })).filter(({ idx }) => !skipIndices.has(idx));

    if (uniqueParts.length === 0) continue;

    sections.push(`== SAMPLE ${sampleIdx + 1} (unique parts — this is the actual user request) ==`);
    for (const { part, idx } of uniqueParts) {
      sections.push(`[Part ${idx + 1}]\n${part.text}`);
    }
  }

  return sections.join("\n\n");
}
