import { type EvalRow } from "@/lib/evaluation/types";
import { tryParseJson } from "@/lib/utils";

/** Opened first when a task has it, as in Harbor's task layout. */
export const DEFAULT_FILE = "instruction.md";

export interface FileNode {
  name: string;
  /** Relative to the tree's root dir. */
  path: string;
  size: number;
  /** Set for directories. */
  children?: FileNode[];
}

const metadataString = (row: EvalRow | undefined, key: string): string | null => {
  const raw = row?.["metadata"];
  const metadata = typeof raw === "string" ? tryParseJson(raw) : raw;
  const value = (metadata as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === "string" && value ? value : null;
};

/** The trial's task dir relative to the uploaded evals folder, set by the Harbor plugin on remote runs. */
export const taskPathOf = (row: EvalRow | undefined): string | null => metadataString(row, "task_path");

/** The trial's task, as the table's Task column shows it; null when unset. */
export const taskNameOf = (row: EvalRow | undefined): string | null => {
  const taskId = row?.["taskId"];
  return typeof taskId === "string" && taskId ? taskId : null;
};

/** Harbor's name for the trial, which is also its dir in the suite's job; set by the Harbor plugin. */
export const trialNameOf = (row: EvalRow | undefined): string | null => metadataString(row, "trial_name");

const sortNodes = (nodes: FileNode[]): FileNode[] =>
  nodes
    .map((node) => (node.children ? { ...node, children: sortNodes(node.children) } : node))
    .sort((a, b) => Number(!a.children) - Number(!b.children) || a.name.localeCompare(b.name));

/** The files under `root` (all of them for `""`) as a tree: directories first, then files, each by name. */
export const buildFileTree = (files: { path: string; size: number }[], root: string): FileNode[] => {
  const prefix = root ? `${root}/` : "";
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

const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);

/**
 * What every trial of the suite at `suitePath` shares, from the whole evals folder: everything but task
 * dirs (any dir holding a `task.toml`) and other suites (top-level dirs holding a `harbor.yaml`).
 */
export const sharedFilesOf = <T extends { path: string }>(files: T[], suitePath: string): T[] => {
  const hidden = files
    .filter(
      (f) =>
        f.path.endsWith("/task.toml") || (/^[^/]+\/harbor\.yaml$/.test(f.path) && !f.path.startsWith(`${suitePath}/`))
    )
    .map((f) => dirOf(f.path));
  return files.filter((f) => !hidden.some((dir) => f.path.startsWith(dir)));
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
