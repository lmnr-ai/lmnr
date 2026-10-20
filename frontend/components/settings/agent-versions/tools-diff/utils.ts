export type ToolChangeStatus = "added" | "removed" | "modified";

export interface ToolChange {
  name: string;
  status: ToolChangeStatus;
  /** Pretty JSON of the tool; empty on the side where it doesn't exist. */
  oldText: string;
  newText: string;
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

const STATUS_ORDER: Record<ToolChangeStatus, number> = { modified: 0, added: 1, removed: 2 };

/** Per-tool changes between two stored tool sets, matched by name. */
export function diffTools(oldText: string, newText: string): ToolsDiff {
  const before = toolsByName(oldText);
  const after = toolsByName(newText);
  const changes: ToolChange[] = [];
  let unchanged = 0;

  for (const [name, newTool] of after) {
    const oldTool = before.get(name);
    if (oldTool === undefined) changes.push({ name, status: "added", oldText: "", newText: newTool });
    else if (oldTool !== newTool) changes.push({ name, status: "modified", oldText: oldTool, newText: newTool });
    else unchanged++;
  }
  for (const [name, oldTool] of before) {
    if (!after.has(name)) changes.push({ name, status: "removed", oldText: oldTool, newText: "" });
  }

  changes.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
  return { changes, unchanged };
}
