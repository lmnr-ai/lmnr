export const FETCH_SIZE = 50;

export const evalDatasetsHref = (projectId: string) => `/project/${projectId}/eval-datasets`;

export const evalDatasetHref = (projectId: string, dataset: string) =>
  `${evalDatasetsHref(projectId)}/${encodeURIComponent(dataset)}`;

/** The evaluations page with the dataset's group selected: `lmnr-cli eval run` reports a dataset's runs to a group named after it. */
export const datasetEvaluationsHref = (projectId: string, dataset: string) =>
  `/project/${projectId}/evaluations?groupId=${encodeURIComponent(dataset)}`;

/** `/api/projects/<project>/eval-datasets/<dataset>[/tasks/<task>]`. */
export const evalDatasetApi = (projectId: string, dataset: string, task?: string) =>
  `/api/projects/${projectId}/eval-datasets/${encodeURIComponent(dataset)}` +
  (task === undefined ? "" : `/tasks/${encodeURIComponent(task)}`);
