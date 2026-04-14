import { extractInputsForGroup, joinUserParts } from "@/lib/actions/sessions/extract-input";
import { type ParsedInput, parseExtractedMessages } from "@/lib/actions/sessions/parse-input";
import { fetchSkeletonHashes } from "@/lib/actions/sessions/trace-io";

import type { InputSpanRow } from "./queries";

export async function extractUserInputsForSpans(
  rows: InputSpanRow[],
  projectId: string
): Promise<Record<string, string | null>> {
  const userInputs: Record<string, string | null> = {};
  if (rows.length === 0) return userInputs;

  const parsedSpans: Array<{ spanId: string; parsed: ParsedInput; rawInput: string }> = [];

  for (const row of rows) {
    const parsed = parseExtractedMessages(row.firstMessage, row.secondMessage);
    if (!parsed) {
      userInputs[row.spanId] = null;
      continue;
    }
    const rawInput = joinUserParts(parsed.userParts);
    if (!rawInput) {
      userInputs[row.spanId] = null;
      continue;
    }
    parsedSpans.push({ spanId: row.spanId, parsed, rawInput });
  }

  if (parsedSpans.length === 0) return userInputs;

  const withSystem: typeof parsedSpans = [];
  const withoutSystem: typeof parsedSpans = [];
  for (const entry of parsedSpans) {
    if (entry.parsed.systemText) {
      withSystem.push(entry);
    } else {
      withoutSystem.push(entry);
    }
  }

  for (const entry of withoutSystem) {
    userInputs[entry.spanId] = entry.rawInput;
  }

  if (withSystem.length === 0) return userInputs;

  const systemTexts = withSystem.map((e) => e.parsed.systemText!);
  const hashes = await fetchSkeletonHashes(systemTexts, projectId);

  const byHash = new Map<string, typeof withSystem>();
  for (let i = 0; i < withSystem.length; i++) {
    const hash = hashes[i];
    if (!hash) {
      userInputs[withSystem[i].spanId] = withSystem[i].rawInput;
      continue;
    }
    const group = byHash.get(hash) ?? [];
    group.push(withSystem[i]);
    byHash.set(hash, group);
  }

  await Promise.all(
    Array.from(byHash.entries()).map(async ([hash, entries]) => {
      const traces = entries.map((e) => ({
        traceId: e.spanId,
        output: null,
        parsed: e.parsed,
      }));
      const groupResults: Record<string, { input: string | null; output: string | null }> = {};
      await extractInputsForGroup(hash, projectId, traces, groupResults);
      for (const entry of entries) {
        userInputs[entry.spanId] = groupResults[entry.spanId]?.input ?? entry.rawInput;
      }
    })
  );

  return userInputs;
}
