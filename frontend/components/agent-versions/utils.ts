import { type AgentVersionItem } from "@/lib/actions/agents";
import { getClusterColorById } from "@/lib/clusters/colors";

import { diffTools, type ToolChangeStatus } from "./tools-diff/utils";

/** Chart range when the URL has none: last 7 days. */
export const DEFAULT_PAST_HOURS = "168";

export function agentDisplayName(name: string | null): string {
  return name ?? "Unnamed agent";
}

export function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

// Same id-hashed categorical palette as signal clusters, so a version keeps its color everywhere.
export const versionColor = (versionId: string): string => getClusterColorById(versionId);

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
