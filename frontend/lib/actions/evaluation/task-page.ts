import { type QueryResult } from "@/lib/actions/common/query-builder";
import {
  buildEvalTaskPageQuery,
  buildEvalTrialsQuery,
  type EvalQueryOptions,
} from "@/lib/actions/evaluation/query-builder";
import { meanTrialColumns } from "@/lib/evaluation/task-groups";
import { type EvalRow } from "@/lib/evaluation/types";

type RunQuery = <T extends Record<string, unknown>>(query: QueryResult) => Promise<T[]>;

/**
 * Fetch one page of Tasks as flat Trial rows, ordered by Task. With `targetId`, each Trial carries
 * `compared:<col>` = the target run's mean over the same Task's Trials (avg vs avg).
 */
export async function fetchEvalTaskPage(
  runQuery: RunQuery,
  options: EvalQueryOptions & { targetId?: string }
): Promise<EvalRow[]> {
  const { targetId, ...pageOptions } = options;
  if (!pageOptions.columns.some((c) => c.id === "taskId")) {
    throw new Error("columns must include taskId");
  }

  const taskIds = (await runQuery<{ task_id: string }>(buildEvalTaskPageQuery(pageOptions))).map((r) => r.task_id);
  if (taskIds.length === 0) return [];

  const { evaluationId, columns, traceIds, filters } = pageOptions;
  const trials = await runQuery(buildEvalTrialsQuery({ evaluationId, columns, traceIds, filters, taskIds }));

  const taskOrder = new Map(taskIds.map((id, i) => [id, i]));
  trials.sort((a, b) => taskOrder.get(String(a["taskId"]))! - taskOrder.get(String(b["taskId"]))!);

  if (!targetId) return trials;

  // Search trace ids belong to the primary run, so they don't narrow the target run.
  const comparedTrials = await runQuery(
    buildEvalTrialsQuery({ evaluationId: targetId, columns, traceIds: [], filters, taskIds })
  );
  const comparedByTask = new Map<string, EvalRow[]>();
  for (const t of comparedTrials) {
    const taskId = String(t["taskId"]);
    comparedByTask.set(taskId, [...(comparedByTask.get(taskId) ?? []), t]);
  }
  const comparableIds = columns.filter((c) => c.comparable).map((c) => c.id);

  const comparedMeans = new Map(
    [...comparedByTask].map(([taskId, group]) => [
      taskId,
      Object.fromEntries(
        Object.entries(meanTrialColumns(group, comparableIds)).map(([id, value]) => [`compared:${id}`, value])
      ),
    ])
  );

  return trials.map((t) => ({ ...t, ...comparedMeans.get(String(t["taskId"])) }));
}
