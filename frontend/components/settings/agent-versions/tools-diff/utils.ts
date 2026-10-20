import { diffLines } from "diff";

export type ToolChangeStatus = "added" | "removed" | "modified";

export interface ToolChange {
  name: string;
  status: ToolChangeStatus;
  /** Pretty JSON of the tool; empty on the side where it doesn't exist. */
  oldText: string;
  newText: string;
  /** Changed line counts of the tool's JSON diff. */
  additions: number;
  deletions: number;
}

export interface ToolsDiff {
  changes: ToolChange[];
  unchanged: number;
}

/** Same matching key as the app-server's `tool_name`: `name`, else `type`, else `id`. */
function toolName(tool: unknown): string {
  if (tool && typeof tool === "object") {
    for (const key of ["name", "type", "id"]) {
      const value = (tool as Record<string, unknown>)[key];
      if (typeof value === "string" && value) return value;
    }
  }
  return "(unnamed)";
}

/** Tools keyed by name; repeated names get a ` #n` suffix so none are lost. */
function toolsByName(text: string): Map<string, string> {
  const byName = new Map<string, string>();
  if (!text) return byName;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    byName.set("(unparsed)", text);
    return byName;
  }
  const tools = Array.isArray(parsed) ? parsed : [parsed];
  for (const tool of tools) {
    const base = toolName(tool);
    let name = base;
    for (let n = 2; byName.has(name); n++) name = `${base} #${n}`;
    byName.set(name, JSON.stringify(tool, null, 2));
  }
  return byName;
}

function toolChange(name: string, status: ToolChangeStatus, oldText: string, newText: string): ToolChange {
  let additions = 0;
  let deletions = 0;
  for (const part of diffLines(oldText, newText, { ignoreNewlineAtEof: true })) {
    if (part.added) additions += part.count ?? 0;
    else if (part.removed) deletions += part.count ?? 0;
  }
  return { name, status, oldText, newText, additions, deletions };
}

const STATUS_ORDER: Record<ToolChangeStatus, number> = { modified: 0, added: 1, removed: 2 };

/** Per-tool changes between two stored tool sets, matched by name. */
export function diffTools(oldText: string, newText: string): ToolsDiff {
  const before = toolsByName(oldText);
  const after = toolsByName(newText);
  const changes: ToolChange[] = [];
  let unchanged = 0;

  for (const [name, newTool] of after) {
    const oldTool = before.get(name);
    if (oldTool === undefined) changes.push(toolChange(name, "added", "", newTool));
    else if (oldTool !== newTool) changes.push(toolChange(name, "modified", oldTool, newTool));
    else unchanged++;
  }
  for (const [name, oldTool] of before) {
    if (!after.has(name)) changes.push(toolChange(name, "removed", oldTool, ""));
  }

  changes.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
  return { changes, unchanged };
}
