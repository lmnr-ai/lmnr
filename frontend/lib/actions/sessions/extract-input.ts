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

// Structural fingerprint of a user message: sequence of top-level XML-like tags (nested tags ignored), or "plain" for messages with no tags.
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

/**
 * For a group of traces sharing the same system prompt, generate or
 * retrieve a cached regex, then apply it to extract each trace's input.
 */
export async function extractInputsForGroup(
  systemHash: string,
  projectId: string,
  traces: TraceForExtraction[],
  // Accepts any result shape with text preview fields + a nullable outputSpan;
  // trace-io.ts hydrates the full Span afterwards, this layer only writes text.
  results: Record<string, { inputPreview: string | null; outputPreview: string | null; outputSpan: unknown }>,
  fingerprint: string = "plain"
): Promise<void> {
  const cacheKey = `${REGEX_CACHE_PREFIX}${projectId}:${systemHash}:${fingerprint}`;

  try {
    const cachedRegex = await cache.get<string>(cacheKey);
    if (cachedRegex) {
      let allMatched = true;
      for (const trace of traces) {
        const joinedText = joinUserParts(trace.parsed?.userParts ?? []);
        if (!joinedText) {
          results[trace.traceId] = { inputPreview: null, outputPreview: trace.output, outputSpan: null };
          continue;
        }
        const result = applyRegex(cachedRegex, joinedText);
        if (result.kind === "extracted") {
          results[trace.traceId] = { inputPreview: result.text, outputPreview: trace.output, outputSpan: null };
        } else if (result.kind === "no-user-request") {
          results[trace.traceId] = { inputPreview: null, outputPreview: trace.output, outputSpan: null };
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
    // ignore cache errors
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
    return;
  }

  await observe({ name: "trace-io:extract-trace-inputs", input: { projectId } }, async () => {
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
      return;
    }

    let anyMatch = false;
    for (const trace of traces) {
      const joinedText = joinUserParts(trace.parsed?.userParts ?? []);
      if (!joinedText) {
        results[trace.traceId] = { inputPreview: null, outputPreview: trace.output, outputSpan: null };
        continue;
      }
      const result = observe({ name: "apply-regex", input: { pattern: regex, text: joinedText } }, () =>
        applyRegex(regex, joinedText)
      );
      if (result.kind === "extracted") {
        results[trace.traceId] = { inputPreview: result.text, outputPreview: trace.output, outputSpan: null };
        anyMatch = true;
      } else if (result.kind === "no-user-request") {
        results[trace.traceId] = { inputPreview: null, outputPreview: trace.output, outputSpan: null };
        anyMatch = true;
      } else {
        results[trace.traceId] = { inputPreview: joinedText, outputPreview: trace.output, outputSpan: null };
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
