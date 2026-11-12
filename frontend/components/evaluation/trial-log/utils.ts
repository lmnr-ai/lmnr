import { z } from "zod/v4";

import { type FileNode } from "@/components/evaluation/task-files/utils";
import { durationMsBetween } from "@/lib/traces/format";

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

/** Harbor's `result.json` of a trial (`TrialResult`), the fields the summary shows. */
export const RESULT_FILE = "result.json";

const PhaseSchema = z.object({ started_at: z.string().nullish(), finished_at: z.string().nullish() }).nullish();

const TrialResultSchema = z.object({
  started_at: z.string().nullish(),
  finished_at: z.string().nullish(),
  environment_setup: PhaseSchema,
  agent_setup: PhaseSchema,
  agent_execution: PhaseSchema,
  verifier: PhaseSchema,
  exception_info: z.object({ exception_type: z.string(), exception_message: z.string() }).nullish(),
});

export interface TrialSummary {
  /** Total first, then each phase that ran, in order. */
  durations: { label: string; ms: number }[];
  exception: { type: string; message: string } | null;
}

const PHASES = [
  ["environment_setup", "Environment"],
  ["agent_setup", "Agent setup"],
  ["agent_execution", "Agent"],
  ["verifier", "Verifier"],
] as const;

export const summarizeResult = (text: string): TrialSummary | null => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = TrialResultSchema.safeParse(json);
  if (!parsed.success) return null;
  const result = parsed.data;
  const durations: TrialSummary["durations"] = [];
  const total = durationMsBetween(result.started_at ?? undefined, result.finished_at ?? undefined);
  if (total !== null) durations.push({ label: "Total", ms: total });
  for (const [key, label] of PHASES) {
    const phase = result[key];
    const ms = durationMsBetween(phase?.started_at ?? undefined, phase?.finished_at ?? undefined);
    if (ms !== null) durations.push({ label, ms });
  }
  const exception = result.exception_info
    ? { type: result.exception_info.exception_type, message: result.exception_info.exception_message }
    : null;
  return { durations, exception };
};
