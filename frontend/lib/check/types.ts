export const checkTypeToStringMap: Record<string, string> = {
  EVAL: 'Evaluation',
  INPUT: 'Input (Coming soon)'
};

// for URLs, which start with /project/{projectId}/ ... url from this map ... /{templateId}
export const checkTypeToTemplateUrlMap: Record<string, string> = {
  EVAL: '/evaluations'
};

export type CheckType = 'EVAL' | 'INPUT';

export type Check = {
  name: string; // name is needed for better display, e.g. "Evaluation against dataset {dataset_name}"
  type: CheckType;
  targetScore: number;
  templateId: string | null;
};

export type CheckJobStatus = 'Running' | 'Passed' | 'NotPassed' | 'ExecError';

export type CheckJob = {
  id: string;
  name: string; // name is needed for better display, e.g. "Evaluation against dataset {dataset_name}"
  type: CheckType;
  status: CheckJobStatus;
  targetScore: number;
  executorJobId: string | null;
  createdAt: string; // "Running" is set when created
  finishedAt: string | null; // "Passed" | "NotPassed" | "ExecError" is set when finished
};
