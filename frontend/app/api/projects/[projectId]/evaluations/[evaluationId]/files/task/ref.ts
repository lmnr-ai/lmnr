import { type TrialTaskRef } from "@/lib/actions/evaluation/files";

export const trialTaskRefOf = (params: URLSearchParams): TrialTaskRef => ({
  task: params.get("task") || null,
  hash: params.get("hash") || null,
  taskPath: params.get("taskPath") || null,
});
