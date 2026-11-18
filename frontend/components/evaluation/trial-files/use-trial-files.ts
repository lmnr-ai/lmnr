import { useMemo } from "react";
import useSWR from "swr";

import { taskNameOf, taskPathOf, taskVersionHashOf, trialNameOf } from "@/components/evaluation/task-files/utils";
import { type TrialTaskFiles } from "@/lib/actions/evaluation/files";
import { swrFetcher } from "@/lib/api/fetch-api";
import { type EvalRow, type Evaluation } from "@/lib/evaluation/types";

import { trialFilesUrls } from "./utils";

export const FILES_SWR_OPTIONS = { revalidateOnFocus: false, shouldRetryOnError: false };

export type TrialFilesTarget = ReturnType<typeof useTrialFiles>["target"];

/**
 * Where the selected trial's files come from, and whether it has any: a remote
 * run always has its agent dir and logs; any other run only a pushed task
 * version (`datasetV2Id` + the trial's `taskVersionHash`), which is fetched here
 * to know (the Files view reuses the same SWR entry).
 */
export const useTrialFiles = (projectId: string, evaluation: Evaluation | undefined, row: EvalRow | undefined) => {
  const hosted = !!evaluation?.hostedMetadata;
  const task = taskNameOf(row);
  const hash = taskVersionHashOf(row);
  const taskPath = taskPathOf(row);
  const trialName = trialNameOf(row);
  const datasetV2Id = evaluation?.datasetV2Id;
  const evaluationId = evaluation?.id;

  const target = useMemo(() => {
    // Before the trial loads there's no task path or trial name, which isn't "not uploaded".
    if (!evaluationId || !row) return null;
    const hasVersion = !!datasetV2Id && !!task && !!hash;
    if (!hosted && !hasVersion) return null;
    return {
      hosted,
      urls: trialFilesUrls(projectId, evaluationId, { task, hash, taskPath }, trialName),
      trialName,
      taskName: task,
    };
  }, [projectId, evaluationId, row, datasetV2Id, hosted, task, hash, taskPath, trialName]);

  const taskFiles = useSWR<TrialTaskFiles>(target?.urls.task ?? null, swrFetcher, FILES_SWR_OPTIONS);
  return { target, available: !!target && (target.hosted || !!taskFiles.data) };
};
