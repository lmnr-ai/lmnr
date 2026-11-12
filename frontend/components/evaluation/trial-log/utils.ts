import { type FileNode } from "@/components/evaluation/task-files/utils";

/**
 * What a trial dir opens on, best first: the traceback of a failed trial, the
 * agent's output, the verifier's, then Harbor's own trial log.
 */
const DEFAULT_FILES = [/^exception\.txt$/, /^agent\/[^/]+\.txt$/, /^verifier\/test-stdout\.txt$/, /^trial\.log$/];

export const defaultLogFile = (files: FileNode[]): FileNode | null => {
  for (const pattern of DEFAULT_FILES) {
    const file = files.find((f) => pattern.test(f.path));
    if (file) return file;
  }
  return files[0] ?? null;
};
