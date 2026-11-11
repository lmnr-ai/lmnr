import { type EvalRow } from "@/lib/evaluation/types";
import { tryParseJson } from "@/lib/utils";

/** Opened first when a task has it, as in Harbor's task layout. */
export const DEFAULT_FILE = "instruction.md";

export interface FileNode {
  name: string;
  /** Relative to the task dir. */
  path: string;
  size: number;
  /** Set for directories. */
  children?: FileNode[];
}

/** The trial's task dir relative to the uploaded evals folder, set by the Harbor plugin on remote runs. */
export const taskPathOf = (row: EvalRow | undefined): string | null => {
  const raw = row?.["metadata"];
  const metadata = typeof raw === "string" ? tryParseJson(raw) : raw;
  const taskPath = (metadata as Record<string, unknown> | null | undefined)?.["task_path"];
  return typeof taskPath === "string" && taskPath ? taskPath : null;
};

const sortNodes = (nodes: FileNode[]): FileNode[] =>
  nodes
    .map((node) => (node.children ? { ...node, children: sortNodes(node.children) } : node))
    .sort((a, b) => Number(!a.children) - Number(!b.children) || a.name.localeCompare(b.name));

/** The files under `root` as a tree: directories first, then files, each by name. */
export const buildFileTree = (files: { path: string; size: number }[], root: string): FileNode[] => {
  const prefix = `${root}/`;
  const top: FileNode[] = [];
  const dirs = new Map<string, FileNode>();
  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const parts = file.path.slice(prefix.length).split("/");
    let siblings = top;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      let dir = dirs.get(dirPath);
      if (!dir) {
        dir = { name: parts[i], path: dirPath, size: 0, children: [] };
        dirs.set(dirPath, dir);
        siblings.push(dir);
      }
      siblings = dir.children!;
    }
    siblings.push({ name: parts[parts.length - 1], path: parts.join("/"), size: file.size });
  }
  return sortNodes(top);
};

export const flattenFiles = (nodes: FileNode[]): FileNode[] =>
  nodes.flatMap((node) => (node.children ? flattenFiles(node.children) : [node]));

const LANGUAGES: Record<string, string> = {
  py: "python",
  sh: "bash",
  bash: "bash",
  js: "javascript",
  mjs: "javascript",
  ts: "typescript",
  tsx: "tsx",
  json: "json",
  jsonl: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  sql: "sql",
  html: "markup",
  xml: "markup",
  css: "css",
  rs: "rust",
  go: "go",
};

/** The Prism language for a file, or undefined for plain text. */
export const languageOf = (path: string): string | undefined => {
  const name = path.split("/").pop() ?? "";
  if (name === "Dockerfile" || name.endsWith(".Dockerfile")) return "docker";
  return LANGUAGES[name.split(".").pop()?.toLowerCase() ?? ""];
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
