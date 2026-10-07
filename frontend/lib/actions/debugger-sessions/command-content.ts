// Shared (client-safe) contract for `command` debugger-session blocks. Kept
// free of server-only imports so the realtime path in the session store can
// run the exact same validation as the server block index.

import { z } from "zod/v4";

// A `command` block — a CLI command an agent ran. Only `command` is guaranteed;
// every other field independently degrades to "absent" when malformed (per-field
// `.catch`), so one bad optional never drops the whole block. Only an invalid or
// missing `command` fails the whole parse.
const nonBlankString = z
  .string()
  .refine((s) => s.trim().length > 0)
  .optional()
  .catch(undefined);

export const CommandBlockContentSchema = z.object({
  command: z.string().min(1),
  // All-or-nothing: a non-string element fails the whole array (→ absent) rather
  // than compacting, which would shift positional meaning (e.g. render the wrong
  // arg as SQL).
  args: z.array(z.string()).optional().catch(undefined),
  exitCode: z.number().int().optional().catch(undefined),
  output: z.string().optional().catch(undefined),
  stderr: z.string().optional().catch(undefined),
  // Keep the ORIGINAL string, but only when it has non-whitespace content —
  // `commandSummary`/the expanded body prefer `raw` via `??`, so an empty raw
  // would blank both even with a valid `command`/`args`. Reasoning is untrusted
  // free-text (CLI `--reasoning`); wire `null`/absent/blank all degrade to absent.
  raw: nonBlankString,
  reasoning: nonBlankString,
});

export type CommandBlockContent = z.infer<typeof CommandBlockContentSchema>;

// A malformed optional field degrades to "absent"; only an invalid/missing
// `command` (or a non-object) drops the whole block (→ null).
export const parseCommandBlockContent = (content: unknown): CommandBlockContent | null => {
  const result = CommandBlockContentSchema.safeParse(content);
  return result.success ? result.data : null;
};

// The summary only ever renders as a single truncated line, so collapse at most
// this many chars — `raw` is uncapped on the wire and regexing all of it on
// every render would be wasted work.
const SUMMARY_BUDGET = 200;

// One-line summary of the invocation: prefer the full raw string, fall back to
// the subcommand + its args. `trimStart` before slicing (it only scans the
// leading whitespace run) — a 200+ char whitespace prefix would otherwise fill
// the whole budget and trim away to a blank summary.
export const commandSummary = (content: CommandBlockContent): string =>
  (content.raw ?? [content.command, ...(content.args ?? [])].join(" "))
    .trimStart()
    .slice(0, SUMMARY_BUDGET)
    .replace(/\s+/g, " ")
    .trim();

// The one-line label shown next to a command's icon, plus whether it came from
// the agent's reasoning (untrusted prose — rendered in a normal font) vs. the
// invocation summary (a command line — rendered mono). Reasoning is uncapped, so
// it gets the same single-line budget/whitespace collapse as the summary (the
// full command is still visible in the expanded detail).
export const commandLabelParts = (content: CommandBlockContent): { text: string; fromReasoning: boolean } => {
  const reasoning = content.reasoning?.trim();
  if (reasoning) return { text: reasoning.slice(0, SUMMARY_BUDGET).replace(/\s+/g, " ").trim(), fromReasoning: true };
  return { text: commandSummary(content), fromReasoning: false };
};

export const commandLabel = (content: CommandBlockContent): string => commandLabelParts(content).text;
