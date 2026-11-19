/**
 * What a trial's Harbor dir opens on when it has no file the user already
 * picked, best first: logs the dataset's own agent or harness writes (e.g.
 * `run_case.log`), a built-in agent's output (`oracle.txt`, `claude-code.txt`),
 * the traceback of a failed trial, the verifier's output, then Harbor's own
 * trial log.
 */
const DEFAULT_FILES = [
  /^agent\/[^/]+\.log$/,
  /^agent\/[^/]+\.txt$/,
  /^exception\.txt$/,
  /^verifier\/test-stdout\.txt$/,
  /^trial\.log$/,
];

/** `preferred` when `files` (paths relative to the trial dir) has it, else the best default. */
export const defaultLogFile = <T extends { path: string }>(files: T[], preferred?: string | null): T | null => {
  const kept = preferred ? files.find((f) => f.path === preferred) : undefined;
  if (kept) return kept;
  for (const pattern of DEFAULT_FILES) {
    const file = files.find((f) => pattern.test(f.path));
    if (file) return file;
  }
  return files[0] ?? null;
};
