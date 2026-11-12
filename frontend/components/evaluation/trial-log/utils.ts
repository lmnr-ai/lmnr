import { type FileNode } from "@/components/evaluation/task-files/utils";

/**
 * What a trial dir opens on when it has no file the user already picked, best
 * first: logs the suite's own agent or harness writes (e.g. `run_case.log`),
 * a built-in agent's output (`oracle.txt`, `claude-code.txt`), the traceback
 * of a failed trial, the verifier's output, then Harbor's own trial log.
 */
const DEFAULT_FILES = [
  /^agent\/[^/]+\.log$/,
  /^agent\/[^/]+\.txt$/,
  /^exception\.txt$/,
  /^verifier\/test-stdout\.txt$/,
  /^trial\.log$/,
];

/** `preferred` (the file last opened in another trial) when this trial has it, else the best default. */
export const defaultLogFile = (files: FileNode[], preferred?: string | null): FileNode | null => {
  const kept = preferred ? files.find((f) => f.path === preferred) : undefined;
  if (kept) return kept;
  for (const pattern of DEFAULT_FILES) {
    const file = files.find((f) => pattern.test(f.path));
    if (file) return file;
  }
  return files[0] ?? null;
};
