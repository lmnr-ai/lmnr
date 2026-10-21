import { diffLines } from "diff";

export type ToolChangeStatus = "added" | "removed" | "modified";

export interface ToolChange {
  name: string;
  status: ToolChangeStatus;
  /** The tool's lines of the version text; empty on the side where it doesn't exist. */
  oldText: string;
  newText: string;
  /** Changed line counts of the tool's diff. */
  additions: number;
  deletions: number;
}

export interface ToolsDiff {
  changes: ToolChange[];
  unchanged: number;
}

interface Tool {
  /** The tool's header line: `name`, else `type`, else `id` (app-server `tool_name`). */
  name: string;
  /** `namespace.name` when namespaced. */
  label: string;
  text: string;
}

/** Every leaf line has one of these separators; a tool's header line has neither. */
const isLeaf = (line: string) => line.includes(": ") || line.includes(" = ");

function toTool(name: string, lines: string[]): Tool {
  const namespace = lines.find((line) => line.startsWith(`${name}.namespace: `))?.slice(`${name}.namespace: `.length);
  return { name, label: namespace ? `${namespace}.${name}` : name, text: lines.join("\n") };
}

/**
 * Splits version text (app-server `tool_text::render`, cut down to the lines a version's
 * spans share) into tools: a header line with the tool name, then one `name.path` line per
 * leaf. A leaf that doesn't continue the current tool starts one named by its first path
 * segment, so nothing is hidden if a header ever drops out.
 */
function splitTools(text: string): Tool[] {
  const groups: { name: string; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const current = groups.at(-1);
    if (!isLeaf(line)) groups.push({ name: line, lines: [line] });
    else if (current && line.startsWith(`${current.name}.`)) current.lines.push(line);
    else groups.push({ name: line.split(".")[0], lines: [line] });
  }
  return groups.map(({ name, lines }) => toTool(name, lines));
}

/** Tools grouped by name; a name can repeat across namespaces or outright. */
function toolsByName(text: string): Map<string, Tool[]> {
  const byName = new Map<string, Tool[]>();
  for (const tool of splitTools(text)) {
    byName.set(tool.name, [...(byName.get(tool.name) ?? []), tool]);
  }
  return byName;
}

/** Takes the first tool matching `predicate` out of `tools`. */
function take(tools: Tool[], predicate: (tool: Tool) => boolean): Tool | undefined {
  const idx = tools.findIndex(predicate);
  return idx === -1 ? undefined : tools.splice(idx, 1)[0];
}

/**
 * Pairs same-named tools: identical ones first (unchanged), then same namespace, then in
 * order, so adding or removing one never shifts which tools the others are compared with.
 */
function pairTools(before: Tool[], after: Tool[]): { pairs: [Tool | undefined, Tool | undefined][]; shared: number } {
  const right = [...after];
  const changed = before.filter((tool) => !take(right, (t) => t.text === tool.text));
  const pairs: [Tool | undefined, Tool | undefined][] = [];
  const unpaired: Tool[] = [];
  for (const tool of changed) {
    const match = take(right, (t) => t.label === tool.label);
    if (match) pairs.push([tool, match]);
    else unpaired.push(tool);
  }
  while (unpaired.length || right.length) pairs.push([unpaired.shift(), right.shift()]);
  return { pairs, shared: before.length - changed.length };
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

/** Per-tool changes between two stored tool sets, matched by name (see `pairTools`). */
export function diffTools(oldText: string, newText: string): ToolsDiff {
  const beforeByName = toolsByName(oldText);
  const afterByName = toolsByName(newText);
  const changes: ToolChange[] = [];
  let unchanged = 0;

  for (const name of new Set([...beforeByName.keys(), ...afterByName.keys()])) {
    const { pairs, shared } = pairTools(beforeByName.get(name) ?? [], afterByName.get(name) ?? []);
    unchanged += shared;
    const labels = pairs.map(([oldTool, newTool]) => (newTool ?? oldTool)?.label ?? name);
    pairs.forEach(([oldTool, newTool], i) => {
      const repeats = labels.filter((label) => label === labels[i]).length > 1;
      const label = repeats
        ? `${labels[i]} #${labels.slice(0, i + 1).filter((l) => l === labels[i]).length}`
        : labels[i];
      const status: ToolChangeStatus = !oldTool ? "added" : !newTool ? "removed" : "modified";
      changes.push(toolChange(label, status, oldTool?.text ?? "", newTool?.text ?? ""));
    });
  }

  changes.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
  return { changes, unchanged };
}
