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

interface TraceForExtraction {
  traceId: string;
  output: string | null;
  parsed: ParsedInput | null;
}

/**
 * For a group of traces sharing the same system prompt, generate or
 * retrieve a cached regex, then apply it to extract each trace's input.
 */
export async function extractInputsForGroup(
  systemHash: string,
  projectId: string,
  traces: TraceForExtraction[],
  results: Record<string, { input: string | null; output: string | null }>
): Promise<void> {
  const cacheKey = `${REGEX_CACHE_PREFIX}${projectId}:${systemHash}`;

  try {
    const cachedRegex = await cache.get<string>(cacheKey);
    if (cachedRegex) {
      let allMatched = true;
      for (const trace of traces) {
        const joinedText = joinUserParts(trace.parsed?.userParts ?? []);
        if (!joinedText) {
          results[trace.traceId] = { input: null, output: trace.output };
          continue;
        }
        const extracted = applyRegex(cachedRegex, joinedText);
        if (extracted) {
          results[trace.traceId] = { input: extracted, output: trace.output };
        } else {
          allMatched = false;
          break;
        }
      }
      if (allMatched) {
        await cache.expire(cacheKey, SEVEN_DAYS_SECONDS).catch(() => {});
        return;
      }
      await cache.remove(cacheKey).catch(() => {});
    }
  } catch {
    // Redis unavailable
  }

  const samples = traces.slice(0, BATCH_SIZE).filter((t) => t.parsed && t.parsed.userParts.length > 0);
  if (samples.length === 0) {
    for (const trace of traces) {
      results[trace.traceId] = { input: joinUserParts(trace.parsed?.userParts ?? []), output: trace.output };
    }
    return;
  }

  await observe({ name: "trace-io:extract-trace-inputs", input: { projectId } }, async () => {
    const llmInput = buildDeduplicatedLLMInput(samples.map((s) => s.parsed!.userParts));
    const regex = await generateExtractionRegex(llmInput);

    if (!regex) {
      for (const trace of traces) {
        if (!(trace.traceId in results)) {
          results[trace.traceId] = { input: joinUserParts(trace.parsed?.userParts ?? []), output: trace.output };
        }
      }
      return;
    }

    let anyMatch = false;
    for (const trace of traces) {
      const joinedText = joinUserParts(trace.parsed?.userParts ?? []);
      if (!joinedText) {
        results[trace.traceId] = { input: null, output: trace.output };
        continue;
      }
      const extracted = observe({ name: "apply-regex", input: { pattern: regex, text: joinedText } }, () =>
        applyRegex(regex, joinedText)
      );
      if (extracted) {
        results[trace.traceId] = { input: extracted, output: trace.output };
        anyMatch = true;
      } else {
        results[trace.traceId] = { input: joinedText, output: trace.output };
      }
    }

    if (anyMatch) {
      await cache.set(cacheKey, regex, { expireAfterSeconds: SEVEN_DAYS_SECONDS }).catch(() => {});
    }
  });
}

/**
 * Build the LLM prompt from multiple traces' user message parts,
 * deduplicating parts that are identical across samples by index
 * and detecting scaffolding structurally for single-sample cases.
 */
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
