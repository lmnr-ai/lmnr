import { type EvalRow } from "@/lib/evaluation/types";

// Rows are Trials; a Task is every Trial in one evaluation sharing a `taskId`.

const TASK_ROW_ID_PREFIX = "task:";
const MEAN_COLUMN_IDS = new Set(["duration", "cost", "inputCost", "outputCost", "totalCost"]);

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const mean = (values: unknown[]): number | undefined => {
  const nums = values.filter(isFiniteNumber);
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
};

export const parseScores = (scores: unknown): Record<string, number> => {
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
// so the raw `scores` JSON is the source of truth when present.
const trialScores = (row: EvalRow): Record<string, number> => {
  const fromJson = parseScores(row["scores"]);
  if (Object.keys(fromJson).length > 0) return fromJson;
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

/** Task-level values for `columnIds`: means for numbers and scores, the first Trial's value otherwise. */
export const meanTrialColumns = (trials: EvalRow[], columnIds: string[]): EvalRow => {
  const scores = meanScores(trials.map(trialScores));
  return Object.fromEntries(
    columnIds.map((id) => {
      if (id.startsWith("score:")) return [id, scores[id.slice("score:".length)]];
      return [id, mean(trials.map((t) => t[id])) ?? trials[0]?.[id]];
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
    index: Math.min(...trials.map((t) => Number(t["index"] ?? Number.POSITIVE_INFINITY))),
    // Per-Trial values, shown on the expanded Trial rows.
    output: undefined,
    traceId: undefined,
    subRows: trials.map((t, i) => ({ ...t, trialNumber: i + 1 })),
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
