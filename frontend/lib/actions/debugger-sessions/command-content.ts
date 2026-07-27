// Shared (client-safe) contract for `command` debugger-session blocks. Kept
// free of server-only imports so the realtime path in the session store can
// run the exact same validation as the server block index.

// Content of a `command` block — a CLI command an agent ran. Only `command` is
// guaranteed; everything else is optional on the wire.
export type CommandBlockContent = {
  command: string;
  args?: string[];
  exitCode?: number;
  output?: string;
  stderr?: string;
  raw?: string;
  // Optional free-text explanation the agent gave for running the command
  // (CLI `--reasoning`). Untrusted, variable-length; null/absent = none.
  reasoning?: string | null;
};

/**
 * Defensive field-by-field extraction (NOT a strict zod parse): a malformed
 * optional field must degrade to "absent", never drop the whole block. `args`
 * is all-or-nothing — compacting non-string elements out would shift
 * positional meaning (e.g. render the wrong arg as SQL).
 */
export const parseCommandBlockContent = (content: unknown): CommandBlockContent | null => {
  if (!content || typeof content !== "object") return null;
  const c = content as Record<string, unknown>;
  if (typeof c.command !== "string" || c.command.length === 0) return null;
  const args =
    Array.isArray(c.args) && c.args.every((a): a is string => typeof a === "string") ? (c.args as string[]) : undefined;
  return {
    command: c.command,
    ...(args ? { args } : {}),
    ...(typeof c.exitCode === "number" && Number.isInteger(c.exitCode) ? { exitCode: c.exitCode } : {}),
    ...(typeof c.output === "string" ? { output: c.output } : {}),
    ...(typeof c.stderr === "string" ? { stderr: c.stderr } : {}),
    // Empty/whitespace-only `raw` degrades to absent — `commandSummary` and the
    // expanded body prefer `raw` via `??`, so keeping it would blank both even
    // when `command`/`args` are valid.
    ...(typeof c.raw === "string" && c.raw.trim().length > 0 ? { raw: c.raw } : {}),
    // Only keep a non-empty string; wire `null`/absent both degrade to absent.
    ...(typeof c.reasoning === "string" && c.reasoning.trim().length > 0 ? { reasoning: c.reasoning } : {}),
  };
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

// The one-line label shown next to a command's icon: the agent's reasoning when
// it gave any, else the invocation summary. Reasoning is untrusted, uncapped
// prose, so it gets the same single-line budget/whitespace collapse as the
// summary (the full command is still visible in the expanded detail).
export const commandLabel = (content: CommandBlockContent): string => {
  const reasoning = content.reasoning?.trim();
  if (reasoning) return reasoning.slice(0, SUMMARY_BUDGET).replace(/\s+/g, " ").trim();
  return commandSummary(content);
};
