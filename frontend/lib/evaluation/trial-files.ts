/*
 * A trial's Files panel: one tree whose top-level folders each map onto a dir
 * of an archive in the exports bucket. Client-safe (no server imports): the
 * routes resolve paths with these, the panel builds its tree from the listing.
 */

/** The panel's top-level folders, in display order. */
export const TRIAL_FILE_ROOTS = ["task", "agent", "logs"] as const;
export type TrialFileRoot = (typeof TRIAL_FILE_ROOTS)[number];

export interface ArchiveFile {
  path: string;
  size: number;
}

/** A dir inside an archive (`<prefix>.tar.gz` + `<prefix>.index.json`). */
export interface ArchiveDir {
  /** Exports-bucket key of the archive, without `.tar.gz` / `.index.json`. */
  prefix: string;
  /** Relative to the archive root; `""` for the whole archive. */
  dir: string;
  /** Every file in the archive (its index). */
  files: ArchiveFile[];
}

export type TrialFileSources = Partial<Record<TrialFileRoot, ArchiveDir>>;

/** Where `task/` comes from: a pushed task version, or the task dir a remote run uploaded. */
export type TrialTaskSource =
  | { source: "dataset"; dataset: string; task: string; hash: string; pushedAt: string }
  | { source: "upload"; path: string };

export interface TrialFiles {
  trialId: string;
  /** Every file, its path starting with its root folder (`task/instruction.md`, `logs/trial.log`). */
  files: ArchiveFile[];
  /** null when the trial has no `task/` folder. */
  task: TrialTaskSource | null;
  /** A remote run whose job output (`logs/`) isn't uploaded yet: it arrives when the dataset's run ends. */
  logsPending: boolean;
}

export const DATASET_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const TASK_HASH_RE = /^[0-9a-f]{64}$/;

export const isDatasetName = (name: string): boolean =>
  DATASET_NAME_RE.test(name) && new TextEncoder().encode(name).length <= 100;
export const isTaskName = (name: string): boolean =>
  DATASET_NAME_RE.test(name) && new TextEncoder().encode(name).length <= 255;

/** The exports-bucket prefix of a pushed task version (see the LAM-2562 storage layout). */
export const taskVersionPrefix = (projectId: string, dataset: string, task: string, hash: string): string =>
  `${projectId}/datasets/${dataset}/${task}/${hash}`;

/** Joins archive path segments, dropping empty and `.` ones (a `suitePath` of `""` or `.` is the root). */
export const joinArchivePath = (...parts: string[]): string =>
  parts
    .flatMap((part) => part.split("/"))
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");

/** The files under `dir`, their paths relative to it. */
export const filesUnder = (files: ArchiveFile[], dir: string): ArchiveFile[] => {
  const prefix = dir ? `${dir}/` : "";
  return files
    .filter((f) => f.path.startsWith(prefix))
    .map(({ path, size }) => ({ path: path.slice(prefix.length), size }));
};

/** The listing the panel shows: each source's files under its root folder; a source with no files is left out. */
export const listTrialFiles = (sources: TrialFileSources): ArchiveFile[] =>
  TRIAL_FILE_ROOTS.flatMap((root) => {
    const source = sources[root];
    if (!source) return [];
    return filesUnder(source.files, source.dir).map(({ path, size }) => ({ path: `${root}/${path}`, size }));
  });

/**
 * The archive file behind a tree path (`task/…`, `agent/…`, `logs/…`), or null
 * unless it is listed under that root. Only listed files resolve, so a request
 * can never reach outside the trial's own folders.
 */
export const resolveTrialPath = (
  sources: TrialFileSources,
  treePath: string
): { prefix: string; path: string } | null => {
  const slash = treePath.indexOf("/");
  if (slash <= 0) return null;
  const root = treePath.slice(0, slash);
  const rest = treePath.slice(slash + 1);
  if (!rest || !(TRIAL_FILE_ROOTS as readonly string[]).includes(root)) return null;
  const source = sources[root as TrialFileRoot];
  if (!source) return null;
  const path = source.dir ? `${source.dir}/${rest}` : rest;
  return source.files.some((f) => f.path === path) ? { prefix: source.prefix, path } : null;
};
