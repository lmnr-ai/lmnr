import { type ArchiveFile, listArchiveFiles, readArchiveFile } from "@/lib/actions/evaluation/files";
import { NotFoundError } from "@/lib/api/errors";

import { findTaskVersionPrefix, type TaskVersionRef } from "./storage";

/*
 * A task version is `<project>/datasets/<dataset>/<task>/<hash>.tar.gz` plus its
 * `.index.json` (lmnr-cli `eval dataset push`), paths relative to the task dir.
 * Immutable, so the evaluation files reader serves them as is.
 */

class TaskVersionUnavailableError extends NotFoundError {
  constructor() {
    super("This task version's files are not available");
  }
}

const requirePrefix = async (ref: TaskVersionRef): Promise<string> => {
  const prefix = await findTaskVersionPrefix(ref);
  if (!prefix) throw new TaskVersionUnavailableError();
  return prefix;
};

export const getTaskVersionFiles = async (ref: TaskVersionRef): Promise<{ files: ArchiveFile[] }> => ({
  files: await listArchiveFiles(await requirePrefix(ref), TaskVersionUnavailableError),
});

/** Streams one file of a task version, `path` relative to the task dir. */
export const readTaskVersionFile = async (ref: TaskVersionRef, path: string) =>
  readArchiveFile(await requirePrefix(ref), path, TaskVersionUnavailableError);
