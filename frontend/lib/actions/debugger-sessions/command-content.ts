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
  raw?: string;
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
    // Empty/whitespace-only `raw` degrades to absent — `commandSummary` and the
    // expanded body prefer `raw` via `??`, so keeping it would blank both even
    // when `command`/`args` are valid.
    ...(typeof c.raw === "string" && c.raw.trim().length > 0 ? { raw: c.raw } : {}),
  };
};

// The summary only ever renders as a single truncated line, so collapse at most
// this many chars — `raw` is uncapped on the wire and regexing all of it on
// every render would be wasted work.
const SUMMARY_BUDGET = 200;

// One-line summary of the invocation: prefer the full raw string, fall back to
// the subcommand + its args.
export const commandSummary = (content: CommandBlockContent): string =>
  (content.raw ?? [content.command, ...(content.args ?? [])].join(" "))
    .slice(0, SUMMARY_BUDGET)
    .replace(/\s+/g, " ")
    .trim();
