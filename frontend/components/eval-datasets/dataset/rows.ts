import { type EvalDatasetTask } from "@/lib/actions/eval-datasets/types";

export interface TaskVersion {
  hash: string;
  pushedAt: string;
  /** 1-based in push order: the first version pushed is v1. */
  number: number;
}

/** A task as the table shows it: its latest version, and its whole history for the files dialog. */
export interface TaskRow {
  taskId: string;
  latest: TaskVersion;
  /** Every version of the task, newest first. */
  history: TaskVersion[];
}

export const toTaskRows = (tasks: EvalDatasetTask[]): TaskRow[] =>
  tasks.flatMap(({ id, versions }) => {
    const history = versions.map((v, i) => ({ ...v, number: versions.length - i }));
    return history[0] ? [{ taskId: id, latest: history[0], history }] : [];
  });
