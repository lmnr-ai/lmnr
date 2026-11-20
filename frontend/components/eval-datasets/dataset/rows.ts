import { type EvalTaskVersion } from "@/lib/actions/eval-datasets/types";

export interface TaskVersion extends EvalTaskVersion {
  /** 1-based in push order: the first version pushed is v1. */
  number: number;
}

/** Numbers a task's versions, given newest first. */
export const numberVersions = (versions: EvalTaskVersion[]): TaskVersion[] =>
  versions.map((v, i) => ({ ...v, number: versions.length - i }));
