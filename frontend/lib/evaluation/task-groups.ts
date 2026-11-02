import { type EvalRow } from "@/lib/evaluation/types";

// Rows are Trials; a Task is every Trial in one evaluation sharing a `taskId`.

const TASK_ROW_ID_PREFIX = "task:";
const MEAN_COLUMN_IDS = new Set(["duration", "cost", "inputCost", "outputCost", "totalCost"]);
// Per-Trial values a Task row can only show when every Trial agrees.
const SHARED_VALUE_COLUMN_IDS = new Set(["data", "target", "metadata"]);

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const mean = (values: unknown[]): number | undefined => {
  const nums = values.filter(isFiniteNumber);
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
};

const parseScores = (scores: unknown): Record<string, number> => {
  let parsed: unknown = scores;
  if (typeof scores === "string") {
    try {
      parsed = scores ? JSON.parse(scores) : {};
    } catch {
      return {};
    }
  }
  if (parsed == null || typeof parsed !== "object") return {};
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, number] => isFiniteNumber(entry[1]))
  );
};

// `score:<name>` columns come from simpleJSONExtractFloat, which reads a missing score as 0,
// so the raw `scores` JSON is the source of truth whenever the row carries it, even when empty.
const trialScores = (row: EvalRow): Record<string, number> => {
  if (row["scores"] != null) return parseScores(row["scores"]);
  return Object.fromEntries(
    Object.entries(row)
      .filter((entry): entry is [string, number] => entry[0].startsWith("score:") && isFiniteNumber(entry[1]))
      .map(([key, value]) => [key.slice("score:".length), value])
  );
};

// Per-score mean over the Trials that report it; a Trial without a score doesn't count as 0.
const meanScores = (scoreSets: Record<string, number>[]): Record<string, number> => {
  const names = new Set(scoreSets.flatMap((s) => Object.keys(s)));
  return Object.fromEntries([...names].map((name) => [name, mean(scoreSets.map((s) => s[name]))!]));
};

/** Task-level values for `columnIds`: means for numbers and scores, the first present value otherwise. */
const meanTrialColumns = (trials: EvalRow[], columnIds: string[]): EvalRow => {
  const scores = meanScores(trials.map(trialScores));
  return Object.fromEntries(
    columnIds.map((id) => {
      if (id.startsWith("score:")) return [id, scores[id.slice("score:".length)]];
      return [id, mean(trials.map((t) => t[id])) ?? trials.find((t) => t[id] != null)?.[id]];
    })
  );
};

/** One `{ scores }` per Task (mean over its Trials), so run stats weigh every Task equally. */
export const taskMeanScores = (rows: { task_id: string; scores: unknown }[]): { scores?: Record<string, number> }[] => {
  const byTask = new Map<string, Record<string, number>[]>();
  for (const row of rows) {
    const sets = byTask.get(row.task_id) ?? [];
    sets.push(parseScores(row.scores));
    byTask.set(row.task_id, sets);
  }
  return [...byTask.values()].map((sets) => {
    const scores = meanScores(sets);
    return { scores: Object.keys(scores).length > 0 ? scores : undefined };
  });
};

export const isTaskGroupRow = (row: EvalRow): boolean => row["isTaskGroup"] === true;

/** Whether a Task row's `columnId` differs across its Trials (rendered as "varies" instead of a value). */
export const taskValueVaries = (row: EvalRow, columnId: string): boolean =>
  (row["variesColumnIds"] as string[] | undefined)?.includes(columnId) ?? false;

const variesColumnIds = (trials: EvalRow[]): string[] => {
  const ids = new Set(
    trials.flatMap((t) => Object.keys(t).filter((k) => SHARED_VALUE_COLUMN_IDS.has(k) || k.startsWith("custom:")))
  );
  return [...ids].filter((id) => {
    // A Trial that hasn't reported a value yet (pending, or a realtime insert) doesn't disagree.
    const values = trials.map((t) => t[id]).filter((v) => v != null);
    // Numeric custom columns are averaged instead.
    if (id.startsWith("custom:") && values.every(isFiniteNumber)) return false;
    return new Set(values.map((v) => JSON.stringify(v))).size > 1;
  });
};

const buildTaskRow = (taskId: string, trials: EvalRow[]): EvalRow => {
  const meanIds = [
    ...new Set(
      trials.flatMap((t) =>
        Object.keys(t).filter((k) => MEAN_COLUMN_IDS.has(k) || k.startsWith("score:") || k.startsWith("custom:"))
      )
    ),
  ];
  return {
    ...trials[0],
    ...meanTrialColumns(trials, meanIds),
    id: `${TASK_ROW_ID_PREFIX}${taskId}`,
    taskId,
    isTaskGroup: true,
    trialCount: trials.length,
    variesColumnIds: variesColumnIds(trials),
    index: Math.min(...trials.map((t) => Number(t["index"] ?? Number.POSITIVE_INFINITY))),
    // Per-Trial values, shown on the expanded Trial rows.
    output: undefined,
    traceId: undefined,
    subRows: trials,
  };
};

/**
 * Group Trial rows into Task rows in first-seen order. A Task with one Trial stays a plain row;
 * a Task with several becomes a Task row of averages whose `subRows` are its Trials.
 */
export const groupTrialsIntoTasks = (rows: EvalRow[]): EvalRow[] => {
  const groups = new Map<string, EvalRow[]>();
  for (const row of rows) {
    const key = String(row["taskId"] ?? row["id"]);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return Array.from(groups, ([taskId, trials]) => (trials.length === 1 ? trials[0] : buildTaskRow(taskId, trials)));
};

/** Give each Trial `compared:<col>` = the mean over the target run's Trials of the same Task (avg vs avg). */
export const attachComparedMeans = (trials: EvalRow[], comparedTrials: EvalRow[], columnIds: string[]): EvalRow[] => {
  const comparedByTask = new Map<string, EvalRow[]>();
  for (const t of comparedTrials) {
    const taskId = String(t["taskId"]);
    comparedByTask.set(taskId, [...(comparedByTask.get(taskId) ?? []), t]);
  }
  const comparedMeans = new Map(
    [...comparedByTask].map(([taskId, group]) => [
      taskId,
      Object.fromEntries(
        Object.entries(meanTrialColumns(group, columnIds)).map(([id, value]) => [`compared:${id}`, value])
      ),
    ])
  );
  return trials.map((t) => ({ ...t, ...comparedMeans.get(String(t["taskId"])) }));
};
