/** A file of an uploaded archive, `path` relative to the archive's root. */
interface FileEntry {
  path: string;
  size: number;
}

/** A dir path without `./`, trailing slashes, or `.` for the root. */
export const trimDir = (dir: string): string => dir.replace(/^\.\//, "").replace(/\/+$/, "").replace(/^\.$/, "");

/**
 * The files of a run's dataset dir (`suitePath`, relative to the uploaded evals
 * folder) that matter for one trial: everything but `tasks/`, plus the trial's
 * own task dir (`taskPath`, relative to the evals folder too). Paths come back
 * relative to the dataset dir. Without a `taskPath` no task is kept.
 */
export const datasetFilesOf = <T extends FileEntry>(files: T[], suitePath: string, taskPath: string | null): T[] => {
  const root = trimDir(suitePath);
  const prefix = root ? `${root}/` : "";
  const tasksDir = `${prefix}tasks/`;
  const task = taskPath ? `${trimDir(taskPath)}/` : null;
  return files
    .filter(
      (file) =>
        file.path.startsWith(prefix) &&
        (!file.path.startsWith(tasksDir) || (task !== null && file.path.startsWith(task)))
    )
    .map((file) => ({ ...file, path: file.path.slice(prefix.length) }));
};
