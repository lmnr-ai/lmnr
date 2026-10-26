import { type AgentVersionItem } from "@/lib/actions/agents";
import { CATEGORICAL_COLOR_PALETTE } from "@/lib/colors";

import { diffTools, type ToolChangeStatus } from "./tools-diff/utils";

/** Chart range when the URL has none: last 7 days. */
export const DEFAULT_PAST_HOURS = "168";

export function agentDisplayName(name: string | null): string {
  return name ?? "Unnamed agent";
}

export function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

// Walk the hue loop in jumps instead of placing similar hues side by side.
// 29 is coprime with 100, so every palette entry appears before colors repeat.
const VERSION_PALETTE = CATEGORICAL_COLOR_PALETTE.map(
  (_, index) => CATEGORICAL_COLOR_PALETTE[(index * 29) % CATEGORICAL_COLOR_PALETTE.length]
);

export function versionColor(agentId: string, versionNumber: number): string {
  let hash = 2166136261;
  for (let i = 0; i < agentId.length; i++) {
    hash ^= agentId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = ((hash >>> 0) + versionNumber - 1) % VERSION_PALETTE.length;
  return VERSION_PALETTE[index];
}

const TOOL_VERBS: Record<ToolChangeStatus, string> = { added: "added", modified: "updated", removed: "removed" };

/** A summary is prose with tool pills: plain text, or a tool name with its change. */
export type SummarySegment = string | { tool: string; status: ToolChangeStatus };

/** Joins phrases as "a, b and c". */
function joinWithAnd(items: SummarySegment[][]): SummarySegment[] {
  return items.flatMap((item, i) => [...(i === 0 ? [] : [i === items.length - 1 ? " and " : ", "]), ...item]);
}

function toolsPhrase(names: string[], status: ToolChangeStatus): SummarySegment[] {
  const verb = TOOL_VERBS[status];
  if (names.length > 3) return [`${names.length} tools were ${verb}`];
  const pills = joinWithAnd(names.map((tool) => [{ tool, status }]));
  return ["the ", ...pills, names.length === 1 ? ` tool was ${verb}` : ` tools were ${verb}`];
}

/** e.g. "System prompt changed and the [+ Bash] tool was added". */
export function changeSummary(version: AgentVersionItem, previous?: AgentVersionItem): SummarySegment[] {
  if (!previous) return ["Initial version"];

  const phrases: SummarySegment[][] = [];
  if (version.systemPrompt !== previous.systemPrompt) phrases.push(["System prompt changed"]);
  if (version.toolDefinitions !== previous.toolDefinitions) {
    const { changes } = diffTools(previous.toolDefinitions, version.toolDefinitions);
    for (const status of ["added", "modified", "removed"] as const) {
      const names = changes.filter((c) => c.status === status).map((c) => c.name);
      if (names.length > 0) phrases.push(toolsPhrase(names, status));
    }
  }
  if (phrases.length === 0) return ["No changes"];

  const [first, ...rest] = joinWithAnd(phrases);
  return [typeof first === "string" ? first.charAt(0).toUpperCase() + first.slice(1) : first, ...rest];
}
