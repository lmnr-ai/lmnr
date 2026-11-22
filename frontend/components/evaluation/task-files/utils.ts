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

/**
 * `collapsed` minus the directories holding `path`, so the open file is never
 * hidden. The same set when none of them is collapsed.
 */
export const expandTo = (collapsed: ReadonlySet<string>, path: string | null): ReadonlySet<string> => {
  if (!path) return collapsed;
  const parts = path.split("/");
  const ancestors = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
  if (!ancestors.some((dir) => collapsed.has(dir))) return collapsed;
  return new Set([...collapsed].filter((dir) => !ancestors.includes(dir)));
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
