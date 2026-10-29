import { type StatusVariant } from "@/components/evaluation/columns/status-variant";
import { type EvalRow } from "@/lib/evaluation/types";

export type IdStyle = "readable" | "uuid" | "weird";

export interface SandboxConfig {
  statusVariant: StatusVariant;
  seed: number;
  taskCount: number;
  maxTrials: number;
  variableTrials: boolean;
  scoreCount: number;
  errorRate: number;
  pendingRate: number;
  missingScoreRate: number;
  idStyle: IdStyle;
  longText: boolean;
  compare: boolean;
  heatmap: boolean;
  forceLoading: boolean;
  pageSize: number;
  fetchDelayMs: number;
}

export const DEFAULT_CONFIG: SandboxConfig = {
  statusVariant: "ring",
  seed: 1,
  taskCount: 30,
  maxTrials: 3,
  variableTrials: true,
  scoreCount: 3,
  errorRate: 0.08,
  pendingRate: 0,
  missingScoreRate: 0,
  idStyle: "readable",
  longText: false,
  compare: false,
  heatmap: false,
  forceLoading: false,
  pageSize: 50,
  fetchDelayMs: 600,
};

const WEIRD_IDS = [
  "",
  " ",
  "   ",
  "foo",
  "foo#2",
  "foo#2#2",
  "Foo",
  "0",
  "null",
  "undefined",
  "🔥 emoji task",
  "日本語のタスク",
  "a/b/c?d=e&f",
  "<b>not bold</b>",
  "line\nbreak",
  "tab\tseparated",
  "  leading and trailing  ",
  `"double" and 'single' quotes`,
  "x".repeat(240),
  "00000000-0000-0000-0000-000000000000",
];

export const SCENARIOS: { id: string; label: string; config: Partial<SandboxConfig> }[] = [
  { id: "typical", label: "Typical", config: {} },
  { id: "single", label: "1 trial each", config: { maxTrials: 1, variableTrials: false } },
  { id: "many-trials", label: "Many trials (×20)", config: { taskCount: 8, maxTrials: 20, variableTrials: false } },
  {
    id: "running",
    label: "Run in progress",
    config: { pendingRate: 0.3, errorRate: 0.25, maxTrials: 3, variableTrials: false },
  },
  { id: "partial-errors", label: "Partial errors", config: { errorRate: 0.35, maxTrials: 4, variableTrials: false } },
  { id: "all-errors", label: "All errored", config: { errorRate: 1, pendingRate: 0 } },
  { id: "missing-scores", label: "Missing scores", config: { missingScoreRate: 0.4 } },
  { id: "weird-ids", label: "Weird task ids", config: { idStyle: "weird", taskCount: WEIRD_IDS.length } },
  { id: "uuid-ids", label: "UUID task ids", config: { idStyle: "uuid" } },
  { id: "long-text", label: "Long text", config: { longText: true, taskCount: 10 } },
  { id: "no-scores", label: "No scores", config: { scoreCount: 0 } },
  { id: "compare", label: "Compare runs", config: { compare: true } },
  { id: "paging", label: "Paging (500 tasks)", config: { taskCount: 500, pageSize: 50 } },
  { id: "empty", label: "Empty run", config: { taskCount: 0 } },
  { id: "loading", label: "Loading skeleton", config: { forceLoading: true } },
];

export const SCORE_NAMES = ["accuracy", "relevance", "hallucinations", "tokens_used"];
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const WORDS = "the agent should answer the question using the retrieved context and cite its sources clearly".split(
  " "
);

const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Rng = () => number;

const uuid = (rng: Rng) =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(rng() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

const sentence = (rng: Rng, words: number) =>
  Array.from({ length: words }, () => WORDS[Math.floor(rng() * WORDS.length)]).join(" ");

const taskIdFor = (style: IdStyle, i: number, rng: Rng) => {
  if (style === "uuid") return uuid(rng);
  if (style === "weird") return WEIRD_IDS[i % WEIRD_IDS.length] + (i >= WEIRD_IDS.length ? `#${i}` : "");
  return `task-${String(i + 1).padStart(3, "0")}`;
};

// Per-task difficulty so a Task's Trials score alike and runs differ a little.
const scoreValue = (name: string, difficulty: number, rng: Rng) => {
  const p = Math.min(1, Math.max(0, 1 - difficulty + (rng() - 0.5) * 0.4));
  if (name === "accuracy") return rng() < p ? 1 : 0;
  if (name === "relevance") return Math.round(p * 100) / 100;
  if (name === "hallucinations") return Math.round((1 - p) * 10);
  return Math.round(200 + rng() * 4800);
};

interface TrialInput {
  evaluationId: string;
  taskId: string;
  index: number;
  difficulty: number;
  /** Position of the Task in the run, 0..1. */
  progress: number;
  /** Shared by every Trial of the Task. */
  data: string;
  target: string;
}

const makeTrial = (config: SandboxConfig, rng: Rng, input: TrialInput, scoreNames: string[]): EvalRow => {
  // Runs fill in from the top, so pending Trials cluster in later Tasks (averaging to pendingRate).
  const pending = rng() < config.pendingRate * 2 * input.progress;
  const status = pending ? "pending" : rng() < config.errorRate ? "error" : "done";
  const scores =
    status === "done"
      ? Object.fromEntries(
          scoreNames
            .filter(() => rng() >= config.missingScoreRate)
            .map((name) => [name, scoreValue(name, input.difficulty, rng)])
        )
      : {};
  const start = new Date(Date.UTC(2026, 9, 29, 12) + input.index * 60_000 + rng() * 30_000);
  const duration = status === "pending" ? undefined : Math.round((0.4 + rng() * 25) * 100) / 100;
  const inputCost = rng() * 0.01;
  const outputCost = rng() * 0.03;
  const textLength = config.longText ? 60 : 8;

  return {
    id: uuid(rng),
    evaluationId: input.evaluationId,
    taskId: input.taskId,
    index: input.index,
    data: input.data,
    target: input.target,
    metadata: JSON.stringify({ split: rng() < 0.5 ? "train" : "test", difficulty: input.difficulty.toFixed(2) }),
    output: status === "pending" ? "" : JSON.stringify(sentence(rng, textLength * 3)).slice(0, 200),
    duration,
    cost: status === "pending" ? 0 : inputCost + outputCost,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    traceId: uuid(rng),
    startTime: start.toISOString(),
    endTime: duration ? new Date(start.getTime() + duration * 1000).toISOString() : undefined,
    createdAt: start.toISOString(),
    traceStatus: status === "error" ? "error" : status === "pending" ? "" : "success",
    topSpanId: status === "pending" ? NIL_UUID : uuid(rng),
    scores: Object.keys(scores).length > 0 ? JSON.stringify(scores) : "",
    // simpleJSONExtractFloat reads a missing score as 0, so score columns never come back null.
    ...Object.fromEntries(scoreNames.map((name) => [`score:${name}`, scores[name] ?? 0])),
  };
};

/** Flat Trial rows for one run, shaped like the `/evaluations/:id` API response. */
export const generateRun = (config: SandboxConfig, evaluationId: string, seedOffset = 0): EvalRow[] => {
  const rng = mulberry32(config.seed * 1000 + seedOffset);
  const idRng = mulberry32(config.seed);
  const scoreNames = SCORE_NAMES.slice(0, config.scoreCount);
  return Array.from({ length: config.taskCount }, (_, i) => {
    const taskId = taskIdFor(config.idStyle, i, idRng);
    const taskRng = mulberry32(config.seed + i);
    const difficulty = taskRng();
    const textLength = config.longText ? 60 : 8;
    // The table selects substring(..., 1, 200) for these.
    const data = JSON.stringify({
      question: sentence(taskRng, textLength),
      context: sentence(taskRng, textLength * 2),
    }).slice(0, 200);
    const target = JSON.stringify({ answer: sentence(taskRng, textLength) }).slice(0, 200);
    const trials = config.variableTrials ? 1 + Math.floor(rng() * config.maxTrials) : config.maxTrials;
    return Array.from({ length: trials }, () =>
      makeTrial(
        config,
        rng,
        { evaluationId, taskId, index: i, difficulty, progress: i / Math.max(1, config.taskCount - 1), data, target },
        scoreNames
      )
    );
  }).flat();
};

const taskSortValue = (trials: EvalRow[], sortBy: string): number | string | undefined => {
  if (sortBy === "taskId") return String(trials[0]["taskId"]);
  if (sortBy.startsWith("score:")) {
    const name = sortBy.slice("score:".length);
    const values = trials.flatMap((t) => {
      const parsed = t["scores"] ? (JSON.parse(String(t["scores"])) as Record<string, number>) : {};
      return name in parsed ? [parsed[name]] : [];
    });
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  }
  const nums = trials.map((t) => t[sortBy]).filter((v): v is number => typeof v === "number");
  if (nums.length > 0) return nums.reduce((a, b) => a + b, 0) / nums.length;
  return trials.map((t) => String(t[sortBy] ?? "")).sort()[0];
};

/** Order Trials by Task the way the server's task page query does: aggregate per Task, ties by min(index). */
export const sortTrialsByTask = (trials: EvalRow[], sortBy?: string, direction: "asc" | "desc" = "asc"): EvalRow[] => {
  const byTask = new Map<string, EvalRow[]>();
  for (const t of trials) {
    const key = String(t["taskId"]);
    byTask.set(key, [...(byTask.get(key) ?? []), t]);
  }
  const groups = [...byTask.values()];
  if (sortBy) {
    const sign = direction === "asc" ? 1 : -1;
    const keyed = groups.map((g) => ({ g, v: taskSortValue(g, sortBy) }));
    keyed.sort((a, b) => {
      // ClickHouse puts NULLs last regardless of direction.
      if (a.v === undefined || b.v === undefined) return a.v === b.v ? 0 : a.v === undefined ? 1 : -1;
      if (a.v === b.v) return Number(a.g[0]["index"]) - Number(b.g[0]["index"]);
      return (a.v < b.v ? -1 : 1) * sign;
    });
    return keyed.flatMap((k) => k.g);
  }
  return groups.flat();
};

export const searchTrials = (trials: EvalRow[], search: string): EvalRow[] => {
  const needle = search.trim().toLowerCase();
  if (!needle) return trials;
  return trials.filter((t) =>
    ["taskId", "data", "target", "output"].some((k) =>
      String(t[k] ?? "")
        .toLowerCase()
        .includes(needle)
    )
  );
};
