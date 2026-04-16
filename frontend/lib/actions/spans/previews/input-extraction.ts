import { extractInputsForGroup, joinUserParts } from "@/lib/actions/sessions/extract-input";
import { type ParsedInput, parseExtractedMessages } from "@/lib/actions/sessions/parse-input";

import type { InputSpanRow } from "./queries";

export async function extractUserInputsForSpans(
  rows: InputSpanRow[],
  projectId: string
): Promise<Record<string, string | null>> {
  const userInputs: Record<string, string | null> = {};
  if (rows.length === 0) return userInputs;

  const parsedSpans: Array<{ spanId: string; parsed: ParsedInput; rawInput: string; promptHash: string }> = [];

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
    parsedSpans.push({ spanId: row.spanId, parsed, rawInput, promptHash: row.promptHash });
  }

  if (parsedSpans.length === 0) return userInputs;

  const withHash: typeof parsedSpans = [];
  const withoutHash: typeof parsedSpans = [];
  for (const entry of parsedSpans) {
    if (entry.promptHash) {
      withHash.push(entry);
    } else {
      withoutHash.push(entry);
    }
  }

  for (const entry of withoutHash) {
    userInputs[entry.spanId] = entry.rawInput;
  }

  if (withHash.length === 0) return userInputs;

  const byHash = new Map<string, typeof withHash>();
  for (const entry of withHash) {
    const group = byHash.get(entry.promptHash) ?? [];
    group.push(entry);
    byHash.set(entry.promptHash, group);
  }

  await Promise.all(
    Array.from(byHash.entries()).map(async ([hash, entries]) => {
      const traces = entries.map((e) => ({
        traceId: e.spanId,
        output: null,
        parsed: e.parsed,
      }));
      const groupResults: Record<
        string,
        { inputPreview: string | null; outputPreview: string | null; outputSpan: unknown }
      > = {};
      await extractInputsForGroup(hash, projectId, traces, groupResults);
      for (const entry of entries) {
        userInputs[entry.spanId] = groupResults[entry.spanId]?.inputPreview ?? entry.rawInput;
      }
    })
  );

  return userInputs;
}
